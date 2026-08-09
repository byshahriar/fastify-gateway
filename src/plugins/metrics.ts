import fp from "fastify-plugin";
import { collectDefaultMetrics, Counter, Histogram, Registry } from "prom-client";
import { KNOWN_HTTP_METHODS, OTHER_METHOD_LABEL } from "@/constants";

/**
 * Prometheus metrics plugin. Maintains a per-instance registry (so test
 * and embedded instances never collide) with Node.js default metrics plus
 * two custom series.
 *
 * - `http_requests_total{method,route,status}`
 * - `http_request_duration_seconds{method,route,status}`
 * - The `route` label is the matched route pattern — never the raw URL —
 *   so label cardinality stays bounded.
 * - The registry is exposed as `fastify.metricsRegistry` and served by the
 *   `/metrics` route.
 */
export default fp(
  async (fastify) => {
    const registry = new Registry();
    collectDefaultMetrics({ register: registry });

    const requestsTotal = new Counter({
      name: "http_requests_total",
      help: "Total HTTP requests handled by the gateway",
      labelNames: ["method", "route", "status"],
      registers: [registry],
    });

    const requestDuration = new Histogram({
      name: "http_request_duration_seconds",
      help: "HTTP request duration in seconds",
      labelNames: ["method", "route", "status"],
      buckets: [0.005, 0.025, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [registry],
    });

    fastify.decorate("metricsRegistry", registry);

    fastify.addHook("onResponse", async (req, reply) => {
      const labels = {
        method: KNOWN_HTTP_METHODS.has(req.method) ? req.method : OTHER_METHOD_LABEL,
        route: req.routeOptions.url ?? "unmatched",
        status: String(reply.statusCode),
      };
      requestsTotal.inc(labels);
      requestDuration.observe(labels, reply.elapsedTime / 1000);
    });
  },
  { name: "metrics" },
);
