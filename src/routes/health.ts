import type { FastifyPluginAsync } from "fastify";
import { HttpStatus } from "@/constants";

// Exempts a route from rate limiting.
const noRateLimit = { config: { rateLimit: false } };

/**
 * Liveness and readiness probes. Exempt from rate limiting so orchestrator
 * and load-balancer health checks can never exhaust a client's budget.
 * Readiness reports draining during shutdown so traffic is routed away
 * before the listener closes.
 */
const health: FastifyPluginAsync = async (fastify) => {
  fastify.get("/healthz", noRateLimit, async () => ({ status: "ok" }));

  fastify.get("/readyz", noRateLimit, async (_req, reply) => {
    if (fastify.shuttingDown) {
      return reply.code(HttpStatus.ServiceUnavailable).send({ status: "draining" });
    }
    return { status: "ready" };
  });
};

export default health;
