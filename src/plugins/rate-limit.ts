import fp from "fastify-plugin";
import rateLimit from "@fastify/rate-limit";

/**
 * Per-client rate limiting keyed by IP. `req.ip` reflects the real client
 * (see `TRUST_PROXY`). The in-memory store is correct for a single instance;
 * pass the `redis` option to share state across replicas. Routes can opt out
 * with `config: { rateLimit: false }`.
 *
 * Because rate limiting runs before edge auth, failed credential attempts
 * consume the budget — throttling brute force. `RATE_LIMIT_BAN` adds
 * escalating friction: after that many consecutive over-limit responses a
 * client IP is temporarily banned outright.
 */
export default fp(
  async (fastify) => {
    await fastify.register(rateLimit, {
      max: fastify.config.RATE_LIMIT_MAX,
      timeWindow: fastify.config.RATE_LIMIT_WINDOW_MS,
      ban: fastify.config.RATE_LIMIT_BAN > 0 ? fastify.config.RATE_LIMIT_BAN : undefined,
      keyGenerator: (req) => req.ip,
    });
  },
  { name: "rate-limit" },
);
