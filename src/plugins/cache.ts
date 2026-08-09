import { createHash } from "node:crypto";
import { PassThrough, pipeline, type Readable } from "node:stream";
import fp from "fastify-plugin";
import type { FastifyReply, FastifyRequest } from "fastify";
import { Header, HttpStatus } from "@/constants";
import type { GatewayCache } from "@/interfaces";

// Upper bound on a single cache lookup. On timeout the request proceeds to
// the upstream, so a slow or unreachable Redis adds bounded latency instead
// of stalling traffic (the same fail-open posture as the rate limiter).
const LOOKUP_TIMEOUT_MS = 150;

// Response headers replayed on a hit. `content-encoding` is safe to replay
// because the client's `accept-encoding` participates in the cache key.
const STORED_HEADERS = [
  "content-type",
  "content-encoding",
  "content-language",
  Header.CacheControl,
  "etag",
  "last-modified",
  Header.Vary,
] as const;

// `Vary` dimensions that are safe to cache across: either part of the cache
// key, or — for `origin` — regenerated per request by the gateway's own CORS
// plugin rather than replayed from the cache. A response varying on anything
// else (or `*`) is not cached, because serving it to a different client
// could be wrong.
const SAFE_VARY = new Set<string>([Header.Accept, Header.AcceptEncoding, "origin"]);

/**
 * A cached upstream response as stored in Redis.
 */
interface CachedResponse {
  status: number;
  headers: Record<string, string>;
  /** Body bytes, base64-encoded for JSON transport. */
  body: string;
}

/**
 * Builds the Redis key for a request: service-scoped and hashed over the
 * full URL plus the `Vary` dimensions the cache honors.
 *
 * @param service - Owning service name, isolating entries between services.
 * @param req - The incoming request.
 * @returns The Redis key.
 */
function cacheKey(service: string, req: FastifyRequest): string {
  const hash = createHash("sha256")
    .update(req.url)
    .update("\n")
    .update(String(req.headers[Header.Accept] ?? ""))
    .update("\n")
    .update(String(req.headers[Header.AcceptEncoding] ?? ""))
    .digest("hex");
  return `cache:${service}:${hash}`;
}

/**
 * Whether a response's `Vary` header only names dimensions the cache
 * handles safely (see {@link SAFE_VARY}).
 *
 * @param reply - The outgoing reply.
 * @returns `true` when the response is safe to cache.
 */
function varyIsKeyed(reply: FastifyReply): boolean {
  const vary = reply.getHeader(Header.Vary);
  if (vary === undefined) return true;
  const value = Array.isArray(vary) ? vary.join(",") : vary;
  if (typeof value !== "string") return false;
  return value
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .every((v) => v === "" || SAFE_VARY.has(v));
}

/**
 * Response caching plugin, applying deliberately conservative shared-cache
 * rules. When `CACHE_ENABLED` is set it decorates `fastify.gatewayCache`
 * with hook factories that services opt into via
 * {@link ServiceGateway.cacheable}; when disabled the decorator is absent
 * and services proxy straight through.
 *
 * - Only `GET` responses with status 200 are cached, keyed by service, URL,
 *   and the `accept`/`accept-encoding` request headers.
 * - Requests carrying `Authorization` or `Cookie` bypass the cache entirely.
 * - TTL follows the upstream's `Cache-Control` (`s-maxage` over `max-age`),
 *   capped by `CACHE_MAX_TTL_MS`; `no-store`/`no-cache`/`private` responses
 *   are never stored. Without a `Cache-Control`, `CACHE_DEFAULT_TTL_MS`
 *   applies (default 0: cache only what the upstream opts into).
 * - A request `Cache-Control: no-cache` skips the lookup (a revalidation
 *   pass-through); `no-store` skips storing too.
 * - Bodies are teed while streaming to the client and stored after the
 *   fact, so caching never buffers the response path; bodies over
 *   `CACHE_MAX_BODY_BYTES` are streamed through and not stored.
 * - Redis errors and slow lookups fail open: a cache outage never takes the
 *   gateway down. Hits carry `x-cache: HIT`, stored misses `x-cache: MISS`.
 */
export default fp(
  async (fastify) => {
    if (!fastify.config.CACHE_ENABLED) return;
    if (!fastify.config.REDIS_URL) {
      throw new Error(
        "CACHE_ENABLED=true requires REDIS_URL; response caching uses the shared Redis store",
      );
    }

    const { redis } = fastify;
    const config = fastify.config;

    fastify.decorateRequest("cacheKey", "");

    const lookup = async (key: string): Promise<CachedResponse | undefined> => {
      // A closed client rejects immediately; skip without paying the timeout.
      if (redis.status === "end" || redis.status === "close") return undefined;
      let timer: NodeJS.Timeout | undefined;
      try {
        const raw = await Promise.race([
          redis.get(key),
          new Promise<null>((resolve) => {
            timer = setTimeout(() => resolve(null), LOOKUP_TIMEOUT_MS);
            timer.unref();
          }),
        ]);
        return raw ? (JSON.parse(raw) as CachedResponse) : undefined;
      } catch (err) {
        fastify.log.warn({ err }, "cache lookup failed");
        return undefined;
      } finally {
        clearTimeout(timer);
      }
    };

    /**
     * Resolves how long a response may be cached.
     *
     * @param reply - The outgoing reply.
     * @returns TTL in milliseconds; 0 or less means "do not store".
     */
    const resolveTtlMs = (reply: FastifyReply): number => {
      const control = String(reply.getHeader(Header.CacheControl) ?? "");
      if (/\b(?:no-store|no-cache|private)\b/i.test(control)) return 0;

      const sMaxAge = /\bs-maxage=(\d+)/i.exec(control);
      const maxAge = /\bmax-age=(\d+)/i.exec(control);
      const directive = sMaxAge ?? maxAge;
      const ttlMs = directive ? Number(directive[1]) * 1000 : config.CACHE_DEFAULT_TTL_MS;
      return Math.min(ttlMs, config.CACHE_MAX_TTL_MS);
    };

    const gatewayCache: GatewayCache = {
      serveHook: (service) => async (req, reply) => {
        if (req.method !== "GET") return;
        // Never serve shared-cache entries on credentialed requests.
        if (req.headers[Header.Authorization] || req.headers[Header.Cookie]) return;

        const control = String(req.headers[Header.CacheControl] ?? "");
        // `no-store`: neither serve nor store (cacheKey stays unset).
        if (/\bno-store\b/i.test(control)) return;

        req.cacheKey = cacheKey(service, req);

        // `no-cache`: revalidate — skip the lookup but allow re-storing.
        if (/\bno-cache\b/i.test(control)) return;

        const hit = await lookup(req.cacheKey);
        if (!hit) return;

        req.cacheKey = ""; // A served hit must not be re-stored by onSend.
        for (const [name, value] of Object.entries(hit.headers)) {
          reply.header(name, value);
        }
        return reply
          .header(Header.Cache, "HIT")
          .code(hit.status)
          .send(Buffer.from(hit.body, "base64"));
      },

      storeHook: () => async (req, reply, payload) => {
        const key = req.cacheKey;
        if (!key) return payload;

        reply.header(Header.Cache, "MISS");

        if (reply.statusCode !== HttpStatus.Ok) return payload;
        if (!varyIsKeyed(reply)) return payload;
        const ttlMs = resolveTtlMs(reply);
        if (ttlMs <= 0) return payload;

        const headers: Record<string, string> = {};
        for (const name of STORED_HEADERS) {
          const value = reply.getHeader(name);
          if (typeof value === "string") headers[name] = value;
        }

        const store = (body: Buffer) => {
          const entry: CachedResponse = {
            status: reply.statusCode,
            headers,
            body: body.toString("base64"),
          };
          redis.set(key, JSON.stringify(entry), "PX", ttlMs).catch((err: Error) => {
            req.log.warn({ err }, "cache store failed");
          });
        };

        if (typeof payload === "string" || Buffer.isBuffer(payload)) {
          const body = Buffer.from(payload as string | Buffer);
          if (body.length <= config.CACHE_MAX_BODY_BYTES) store(body);
          return payload;
        }

        // Proxied responses arrive as streams. Tee: observe chunks while the
        // original bytes flow to the client, and store once complete.
        if (typeof (payload as Readable)?.pipe === "function") {
          const source = payload as Readable;
          const chunks: Buffer[] = [];
          let size = 0;
          let overflow = false;

          source.on("data", (chunk: Buffer | string) => {
            if (overflow) return;
            // Undici yields Buffers; retain them without copying. Only a
            // string chunk needs materializing.
            const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            size += buf.length;
            if (size > config.CACHE_MAX_BODY_BYTES) {
              overflow = true;
              chunks.length = 0;
            } else {
              chunks.push(buf);
            }
          });

          const out = new PassThrough();
          pipeline(source, out, (err) => {
            if (!err && !overflow) store(Buffer.concat(chunks));
          });
          return out;
        }

        return payload;
      },
    };

    fastify.decorate("gatewayCache", gatewayCache);
    fastify.log.info(
      { maxTtlMs: config.CACHE_MAX_TTL_MS, defaultTtlMs: config.CACHE_DEFAULT_TTL_MS },
      "response caching enabled",
    );
  },
  { name: "cache", dependencies: ["redis"] },
);
