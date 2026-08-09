import httpProxy, { type FastifyHttpProxyOptions } from "@fastify/http-proxy";
import type { FastifyPluginAsync } from "fastify";
import { Header } from "@/constants";
import { AuthScheme } from "@/enums";
import type { GatewayConfig } from "@/types";
import { encodeBasicAuth, redactUrlCredentials } from "@/utils";

type ReplyOptions = NonNullable<FastifyHttpProxyOptions["replyOptions"]>;
type HeaderRewriter = NonNullable<ReplyOptions["rewriteRequestHeaders"]>;

/**
 * Base class for a single upstream proxy.
 *
 * A subclass declares what to proxy (prefix, upstream, auth policy), and
 * {@link ServiceGateway.toPlugin} turns that declaration into an
 * encapsulated Fastify plugin registered in `app.ts`. Encapsulation keeps
 * hooks and decorators added for one service from leaking into another.
 *
 * Shared proxy behavior lives here once, split into overridable steps:
 *
 * - Edge auth is resolved from the strategy registry.
 * - {@link connectionOptions} shapes pooling and timeouts.
 * - {@link createHeaderRewriter} controls forwarded headers and credential
 *   handling.
 */
export abstract class ServiceGateway {
  /**
   * Stable identifier used in logs.
   */
  abstract readonly name: string;

  /**
   * Public path prefix, e.g. `"/api/users"`.
   */
  abstract readonly prefix: string;

  /**
   * Edge authentication required to reach this service.
   */
  protected readonly auth: AuthScheme = AuthScheme.None;

  /**
   * Prefix rewritten onto the upstream path; `"/"` strips {@link prefix}.
   */
  protected readonly rewritePrefix: string = "/";

  /**
   * Whether GET responses from this service participate in the shared
   * response cache (active only when `CACHE_ENABLED` is set; see
   * `plugins/cache.ts` for the caching rules). Restricted to services with
   * no edge auth: a shared cache in front of an authenticated service would
   * serve one client's responses to another.
   */
  protected readonly cacheable: boolean = false;

  /**
   * Resolves this service's upstream base URL.
   *
   * @param config - Validated gateway configuration.
   * @returns The upstream base URL.
   */
  protected abstract upstream(config: GatewayConfig): string;

  /**
   * Credentials the gateway uses to authenticate against the upstream. When
   * set, they are sent as an `Authorization: Basic` header and replace any
   * client-supplied Authorization value.
   *
   * @param _config - Validated gateway configuration.
   * @returns Credentials in `username:password` form, or `undefined` to
   *   forward client headers unchanged.
   */
  protected upstreamCredentials(_config: GatewayConfig): string | undefined {
    return undefined;
  }

  /**
   * Whether this service's edge auth consumes the `Authorization` header, in
   * which case it is stripped before proxying. Basic auth does; the API key
   * scheme uses `x-api-key`, so client bearer tokens pass through. Override
   * when a custom scheme reads (or deliberately forwards) `Authorization`.
   *
   * @returns `true` when the header must not reach the upstream.
   */
  protected consumesAuthorizationHeader(): boolean {
    return this.auth === AuthScheme.Basic;
  }

  /**
   * Shapes the undici connection pool for this service. Override to give a
   * service its own pool size or timeouts.
   *
   * @param config - Validated gateway configuration.
   * @returns The undici options passed to the proxy.
   */
  protected connectionOptions(config: GatewayConfig): FastifyHttpProxyOptions["undici"] {
    return {
      connections: config.UPSTREAM_MAX_CONNECTIONS,
      connectTimeout: config.UPSTREAM_CONNECT_TIMEOUT_MS,
      headersTimeout: config.UPSTREAM_TIMEOUT_MS,
      bodyTimeout: config.UPSTREAM_TIMEOUT_MS,
    };
  }

  /**
   * Builds the header rewriter applied to every proxied request: sets
   * `x-forwarded-*`, strips the gateway's edge credentials, and injects
   * upstream credentials when configured.
   *
   * `x-forwarded-for` is treated according to proxy trust: when the gateway
   * runs behind a trusted proxy the incoming chain is legitimate history and
   * the peer is appended; otherwise the client-supplied value is forged and
   * is replaced with the real peer. `x-forwarded-host` and `-proto` are
   * always overwritten, never taken from the client.
   *
   * Note: `x-forwarded-host` reflects the client `Host` header. Upstreams
   * that build absolute URLs from it should pin an expected host — override
   * this method to enforce one.
   *
   * @param upstreamAuthorization - Precomputed `Authorization` header value
   *   for the upstream, if any.
   * @param trustProxy - Whether the incoming `x-forwarded-for` is trusted.
   * @returns The rewriter passed to the proxy.
   */
  protected createHeaderRewriter(
    upstreamAuthorization?: string,
    trustProxy = true,
  ): HeaderRewriter {
    return (req, headers) => {
      const forwarded = headers[Header.ForwardedFor];
      const peer = req.socket.remoteAddress ?? req.ip;

      const rewritten: typeof headers = {
        ...headers,
        [Header.ForwardedFor]: trustProxy && forwarded ? `${forwarded}, ${peer}` : peer,
        [Header.ForwardedHost]: req.hostname,
        [Header.ForwardedProto]: req.protocol,
      };

      delete rewritten[Header.ApiKey];
      if (this.consumesAuthorizationHeader()) delete rewritten[Header.Authorization];
      if (upstreamAuthorization) rewritten[Header.Authorization] = upstreamAuthorization;

      return rewritten;
    };
  }

  /**
   * Builds the encapsulated Fastify plugin that mounts this proxy.
   *
   * @returns A plugin suitable for `fastify.register`.
   */
  toPlugin(): FastifyPluginAsync {
    return async (fastify) => {
      const config = fastify.config;
      const target = this.upstream(config);

      const credentials = this.upstreamCredentials(config);
      const upstreamAuthorization = credentials ? encodeBasicAuth(credentials) : undefined;

      const edgeAuth =
        this.auth === AuthScheme.None ? undefined : fastify.authStrategy(this.auth);
      if (this.auth !== AuthScheme.None && !edgeAuth) {
        throw new Error(
          `No auth strategy registered for scheme "${this.auth}" (service "${this.name}")`,
        );
      }

      let cached = false;
      if (this.cacheable) {
        if (this.auth !== AuthScheme.None) {
          throw new Error(
            `Service "${this.name}" cannot combine caching with edge auth "${this.auth}"; ` +
              "the shared cache would serve authenticated responses across clients",
          );
        }
        // Hooks added in this encapsulated scope, before the proxy routes
        // register, apply only to this service.
        if (fastify.gatewayCache) {
          fastify.addHook("onRequest", fastify.gatewayCache.serveHook(this.name));
          fastify.addHook("onSend", fastify.gatewayCache.storeHook(this.name));
          cached = true;
        }
      }

      await fastify.register(httpProxy, {
        prefix: this.prefix,
        upstream: target,
        rewritePrefix: this.rewritePrefix,
        // @fastify/http-proxy declares a bespoke `this` on preHandler that
        // standard Fastify hook handlers do not satisfy; adapt with an arrow.
        preHandler: edgeAuth
          ? (request, reply) => edgeAuth.call(fastify, request, reply)
          : undefined,
        undici: this.connectionOptions(config),
        replyOptions: {
          rewriteRequestHeaders: this.createHeaderRewriter(
            upstreamAuthorization,
            fastify.trustProxy,
          ),
        },
      });

      fastify.log.info(
        {
          service: this.name,
          prefix: this.prefix,
          upstream: redactUrlCredentials(target),
          auth: this.auth,
          cached,
        },
        "service route registered",
      );
    };
  }
}
