import type { FastifyPluginAsync } from "fastify";
import { ErrorMessage, Header, HttpStatus } from "@/constants";
import { errorBody, parseBearerToken, safeEqual } from "@/utils";

// Exempt from rate limiting so scrapes never consume a budget, and from load
// shedding so operators keep metrics during the incidents that need them
// most. IP filtering still applies (unlike health probes): a blocked scrape
// is visible and recoverable, so failing it is safe.
const metricsExemptions = { config: { rateLimit: false, shed: false } };

/**
 * Prometheus scrape endpoint. Serves the per-instance registry maintained
 * by the metrics plugin.
 *
 * - When `METRICS_TOKEN` is set, the endpoint requires a matching
 *   `Authorization: Bearer <token>` (constant-time).
 * - When it is empty, the endpoint is open — protect it with network
 *   policy, and prefer setting a token. See the deployment notes in
 *   `docs/operations.md`.
 */
const metrics: FastifyPluginAsync = async (fastify) => {
  const token = fastify.config.METRICS_TOKEN;

  if (!token) {
    fastify.log.warn("METRICS_TOKEN is not set; /metrics is unauthenticated");
  }

  fastify.get("/metrics", metricsExemptions, async (req, reply) => {
    if (token) {
      const provided = parseBearerToken(req.headers[Header.Authorization]);
      if (!provided || !safeEqual(provided, token)) {
        return reply
          .code(HttpStatus.Unauthorized)
          .send(errorBody(req.id, ErrorMessage.Unauthorized));
      }
    }

    reply.header(Header.ContentType, fastify.metricsRegistry.contentType);
    return fastify.metricsRegistry.metrics();
  });
};

export default metrics;
