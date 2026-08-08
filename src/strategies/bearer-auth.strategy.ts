import { createHash } from "node:crypto";
import { Header } from "@/constants";
import type { AuthStrategy } from "@/types";
import { parseBearerToken, sendMisconfigured, sendUnauthorized } from "@/utils";

// Bound the introspection call so a slow auth service cannot stall requests.
const INTROSPECTION_TIMEOUT_MS = 2000;

/**
 * Options for the bearer auth strategy.
 */
export interface BearerAuthOptions {
  /**
   * The auth service's token-introspection endpoint.
   */
  introspectionUrl: string;
  /**
   * Optional bearer token authenticating the gateway to that endpoint.
   */
  introspectionToken?: string;
  /**
   * How long, in milliseconds, to cache an active-token decision so repeated
   * requests with the same token skip introspection. `0` (the default)
   * disables caching and introspects on every request. A non-zero value trades
   * revocation latency for throughput: a revoked token stays accepted until its
   * cached entry expires, so keep it short.
   */
  cacheTtlMs?: number;
}

/**
 * Builds the bearer auth strategy: validates a client's `Authorization: Bearer`
 * token against an external auth service's introspection endpoint, which is
 * expected to answer `{ "active": boolean }` (RFC 7662 style).
 *
 * With `cacheTtlMs` unset or `0` the gateway keeps no token state and asks the
 * auth service on every request, so revocation and refresh are handled entirely
 * by that service. With a positive `cacheTtlMs`, active-token decisions are
 * cached for that window (see {@link BearerAuthOptions.cacheTtlMs}).
 *
 * Fails closed: a missing token, an inactive token, a non-2xx introspection
 * response, or an unreachable/slow auth service all return 401; an unset
 * endpoint returns 500 so a misconfigured gateway never allows traffic.
 *
 * @param options - Introspection endpoint, an optional credential for it, and
 *   an optional cache window.
 * @returns The request guard.
 */
export function createBearerAuthStrategy(options: BearerAuthOptions): AuthStrategy {
  const { introspectionUrl, introspectionToken, cacheTtlMs = 0 } = options;

  // Request headers are fixed per strategy; build them once, not per request.
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (introspectionToken) headers.authorization = `Bearer ${introspectionToken}`;

  // Cache of active-token decisions keyed by a hash of the token (never the raw
  // token), holding the epoch-ms at which the decision expires. Only active
  // decisions are cached, so the map is bounded by the live-token count and an
  // invalid-token flood cannot grow it.
  const cache = cacheTtlMs > 0 ? new Map<string, number>() : undefined;

  return async (req, reply) => {
    if (!introspectionUrl) {
      return sendMisconfigured(
        req,
        reply,
        "BEARER_INTROSPECTION_URL is not set but a route requires it",
      );
    }

    const token = parseBearerToken(req.headers[Header.Authorization]);
    if (!token) return sendUnauthorized(req, reply);

    let cacheKey = "";
    if (cache) {
      cacheKey = createHash("sha256").update(token).digest("hex");
      const expiresAt = cache.get(cacheKey);
      if (expiresAt !== undefined) {
        if (expiresAt > Date.now()) return; // cached active token — allow
        cache.delete(cacheKey); // expired — re-introspect below
      }
    }

    let active: boolean;
    try {
      const res = await fetch(introspectionUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ token }),
        signal: AbortSignal.timeout(INTROSPECTION_TIMEOUT_MS),
      });

      const body = (await res.json()) as { active?: boolean };
      active = res.ok && body.active === true;
    } catch {
      // Auth service unreachable, slow, or returned invalid JSON — fail closed.
      return sendUnauthorized(req, reply);
    }

    if (!active) return sendUnauthorized(req, reply);
    if (cache) cache.set(cacheKey, Date.now() + cacheTtlMs);
  };
}
