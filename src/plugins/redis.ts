import fp from "fastify-plugin";
import fastifyRedis from "@fastify/redis";

/**
 * Registers the official `@fastify/redis` plugin when `REDIS_URL` is set.
 *
 * - Decorates `fastify.redis` with a managed ioredis client shared by the
 *   rate limiter and the response cache.
 * - An error listener is attached so a Redis outage is logged rather than
 *   crashing the process; the client is closed with the app.
 * - Without `REDIS_URL`, no client is created and the rate limiter falls
 *   back to its in-memory store. When `REDIS_URL` is set, Redis should be
 *   reachable at boot.
 * - The offline queue is disabled deliberately: with it on (the ioredis
 *   default), every command issued while Redis is disconnected queues in
 *   memory indefinitely, so during an outage the queue would grow
 *   unboundedly at the request rate and callers would hang awaiting queued
 *   commands. Disabled, commands fail immediately while disconnected,
 *   letting each consumer fail open (the limiter via `skipOnError`, the
 *   cache via its catch-and-continue path).
 */
export default fp(
  async (fastify) => {
    if (!fastify.config.REDIS_URL) return;

    await fastify.register(fastifyRedis, {
      url: fastify.config.REDIS_URL,
      closeClient: true,
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
    });

    // Without a listener an emitted 'error' would crash the process.
    fastify.redis.on("error", (err) => {
      fastify.log.error({ err }, "redis client error");
    });
  },
  { name: "redis" },
);
