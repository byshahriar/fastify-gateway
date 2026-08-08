import fp from "fastify-plugin";
import rateLimit from "@fastify/rate-limit";

/**
 * Per-client rate limiting keyed by IP. `req.ip` reflects the real client
 * (see `TRUST_PROXY`). Routes can opt out with `config: { rateLimit: false }`.
 *
 * Because rate limiting runs before edge auth, failed credential attempts
 * consume the budget — throttling brute force. `RATE_LIMIT_BAN` adds
 * escalating friction: after that many consecutive over-limit responses a
 * client IP is temporarily banned outright.
 *
 * Store selection: with `REDIS_URL` set, the shared `fastify.redis` client
 * (from the `redis` plugin) backs the limiter so state is shared across
 * replicas; otherwise an in-memory store is used, correct only for a single
 * instance. `skipOnError` makes the limiter fail open on store errors —
 * combined with the client's disabled offline queue (see the redis plugin),
 * a Redis outage means unthrottled traffic, never hung or failed requests.
 */
export default fp(
  async (fastify) => {
    const redis = fastify.config.REDIS_URL ? fastify.redis : undefined;

    await fastify.register(rateLimit, {
      max: fastify.config.RATE_LIMIT_MAX,
      timeWindow: fastify.config.RATE_LIMIT_WINDOW_MS,
      ban: fastify.config.RATE_LIMIT_BAN > 0 ? fastify.config.RATE_LIMIT_BAN : undefined,
      keyGenerator: (req) => req.ip,
      redis,
      skipOnError: true,
    });

    fastify.log.info({ store: redis ? "redis" : "in-memory" }, "rate limiting configured");
  },
  { name: "rate-limit", dependencies: ["redis"] },
);
