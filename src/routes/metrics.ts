import type { FastifyPluginAsync } from "fastify";
import { Header, HttpStatus } from "@/constants";
import { safeEqual } from "@/utils";

// Exempts the route from rate limiting so scrapes never consume a budget.
const noRateLimit = { config: { rateLimit: false } };

const BEARER_PATTERN = /^bearer +(.+)$/i;

/**
 * Prometheus scrape endpoint. Serves the per-instance registry maintained by
 * the metrics plugin.
 *
 * When `METRICS_TOKEN` is set, the endpoint requires a matching
 * `Authorization: Bearer <token>` (constant-time). When it is empty the
 * endpoint is open — protect it with network policy, and prefer setting a
 * token. See the deployment notes in docs/operations.md.
 */
const metrics: FastifyPluginAsync = async (fastify) => {
  const token = fastify.config.METRICS_TOKEN;

  if (!token) {
    fastify.log.warn("METRICS_TOKEN is not set; /metrics is unauthenticated");
  }

  fastify.get("/metrics", noRateLimit, async (req, reply) => {
    if (token) {
      const match = BEARER_PATTERN.exec(req.headers[Header.Authorization] ?? "");
      if (!match || !safeEqual(match[1], token)) {
        return reply
          .code(HttpStatus.Unauthorized)
          .send({ error: "Unauthorized", requestId: req.id });
      }
    }

    reply.header("content-type", fastify.metricsRegistry.contentType);
    return fastify.metricsRegistry.metrics();
  });
};

export default metrics;
