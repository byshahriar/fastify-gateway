import { createHash } from "node:crypto";
import { Header } from "@/constants";
import type { AuthStrategy } from "@/types";
import { parseBearerToken, sendMisconfigured, sendUnauthorized } from "@/utils";

// Bound the introspection call so a slow auth service cannot stall requests.
const INTROSPECTION_TIMEOUT_MS = 2000;

// Default cap on cached token decisions (~100 bytes each, so ~1 MB at the
// cap). Without a cap, rotating tokens leak: an expired entry is otherwise
// evicted only when its exact token is presented again, which rotated-away
// tokens never are.
const DEFAULT_CACHE_MAX_ENTRIES = 10_000;

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
  /**
   * Maximum number of cached decisions held at once. At capacity, expired
   * entries are swept first; if still full, the oldest entries are evicted.
   */
  cacheMaxEntries?: number;
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
  const {
    introspectionUrl,
    introspectionToken,
    cacheTtlMs = 0,
    cacheMaxEntries = DEFAULT_CACHE_MAX_ENTRIES,
  } = options;

  // Request headers are fixed per strategy; build them once, not per request.
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (introspectionToken) headers.authorization = `Bearer ${introspectionToken}`;

  // Cache of active-token decisions keyed by a hash of the token (never the raw
  // token), holding the epoch-ms at which the decision expires. Only active
  // decisions are cached (an invalid-token flood cannot grow the map), and the
  // size is capped by `cacheMaxEntries` so rotated-away tokens cannot
  // accumulate — see {@link evictForInsert}.
  const cache = cacheTtlMs > 0 ? new Map<string, number>() : undefined;

  /**
   * Makes room for one more entry when the cache is at capacity: sweeps
   * expired entries first and, if every entry is still live, evicts the
   * oldest insertions (`Map` preserves insertion order).
   */
  function evictForInsert(entries: Map<string, number>) {
    if (entries.size < cacheMaxEntries) return;

    const now = Date.now();
    for (const [key, expiresAt] of entries) {
      if (expiresAt <= now) entries.delete(key);
    }
    for (const key of entries.keys()) {
      if (entries.size < cacheMaxEntries) break;
      entries.delete(key);
    }
  }

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
        // Cached decision is still active — allow the request.
        if (expiresAt > Date.now()) return;
        // Cached decision expired — fall through to re-introspect.
        cache.delete(cacheKey);
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
    if (cache) {
      evictForInsert(cache);
      cache.set(cacheKey, Date.now() + cacheTtlMs);
    }
  };
}
