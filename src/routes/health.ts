import type { FastifyPluginAsync } from "fastify";
import { HttpStatus } from "@/constants";

// Exempts a route from rate limiting, load shedding, and IP filtering.
const probeExemptions = { rateLimit: false, shed: false, ipFilter: false };

// Response schema so Fastify serializes probe replies with compiled
// fast-json-stringify instead of JSON.stringify — probes are the
// highest-frequency gateway-served routes.
const statusReplySchema = {
  type: "object",
  properties: { status: { type: "string" } },
  required: ["status"],
  additionalProperties: false,
} as const;

// Shared route options for both probe endpoints below.
const probeConfig = {
  config: probeExemptions,
  schema: { response: { 200: statusReplySchema, 503: statusReplySchema } },
};

/**
 * Liveness and readiness probes.
 *
 * - Exempt from rate limiting, so orchestrator and load-balancer health
 *   checks can never exhaust a client's budget.
 * - Exempt from load shedding, so an overload cannot fail liveness and
 *   trigger a restart loop.
 * - Readiness reports `draining` during shutdown, and `under-pressure`
 *   while the instance is shedding load, so traffic is routed away in
 *   both cases.
 */
const health: FastifyPluginAsync = async (fastify) => {
  fastify.get("/healthz", probeConfig, async () => ({ status: "ok" }));

  fastify.get("/readyz", probeConfig, async (_req, reply) => {
    if (fastify.shuttingDown) {
      return reply.code(HttpStatus.ServiceUnavailable).send({ status: "draining" });
    }
    if (fastify.isUnderPressure()) {
      return reply.code(HttpStatus.ServiceUnavailable).send({ status: "under-pressure" });
    }
    return { status: "ready" };
  });
};

export default health;
