import fp from "fastify-plugin";
import rateLimit from "@fastify/rate-limit";
import { Redis } from "ioredis";

/**
 * Per-client rate limiting keyed by IP. `req.ip` reflects the real client
 * (see `TRUST_PROXY`). Routes can opt out with `config: { rateLimit: false }`.
 *
 * Because rate limiting runs before edge auth, failed credential attempts
 * consume the budget — throttling brute force. `RATE_LIMIT_BAN` adds
 * escalating friction: after that many consecutive over-limit responses a
 * client IP is temporarily banned outright.
 *
 * Store selection: with `REDIS_URL` set, state is shared across replicas via
 * Redis; otherwise an in-memory store is used, which is correct only for a
 * single instance. On a Redis store error the limiter fails open (a Redis
 * outage never takes the gateway down).
 */
export default fp(
  async (fastify) => {
    const redisUrl = fastify.config.REDIS_URL;
    let redis: Redis | undefined;

    if (redisUrl) {
      redis = new Redis(redisUrl, {
        // Don't block boot on the connection; connect on first use.
        lazyConnect: true,
        connectTimeout: 500,
        // Fail fast so a slow Redis doesn't stall requests.
        maxRetriesPerRequest: 1,
      });

      // A listener is required so a connection error does not crash the
      // process as an unhandled 'error' event.
      redis.on("error", (err) => {
        fastify.log.error({ err }, "rate-limit redis store error");
      });

      fastify.addHook("onClose", async () => {
        redis?.disconnect();
      });
    }

    await fastify.register(rateLimit, {
      max: fastify.config.RATE_LIMIT_MAX,
      timeWindow: fastify.config.RATE_LIMIT_WINDOW_MS,
      ban: fastify.config.RATE_LIMIT_BAN > 0 ? fastify.config.RATE_LIMIT_BAN : undefined,
      keyGenerator: (req) => req.ip,
      redis,
    });

    fastify.log.info({ store: redis ? "redis" : "in-memory" }, "rate limiting configured");
  },
  { name: "rate-limit" },
);
