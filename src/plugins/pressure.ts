import fp from "fastify-plugin";
import underPressure from "@fastify/under-pressure";
import { ErrorMessage, Header, HttpStatus } from "@/constants";
import { errorBody } from "@/utils";

/**
 * Load-shedding plugin backed by `@fastify/under-pressure`. The event loop
 * and memory are sampled on an interval; while any configured threshold is
 * exceeded, incoming requests are answered `503` with a `Retry-After` header
 * instead of queueing behind work the instance cannot absorb — an overloaded
 * gateway stays responsive and recovers instead of degrading every request.
 *
 * Routes marked `config: { shed: false }` (health probes, /metrics) are never
 * shed: liveness must not fail under load — that would turn an overload into
 * a restart loop — and operators need metrics most during an incident.
 * Readiness reports the pressure state via `fastify.isUnderPressure()` so
 * orchestrators route traffic away while the instance sheds.
 */
export default fp(
  async (fastify) => {
    const config = fastify.config;

    await fastify.register(underPressure, {
      maxEventLoopDelay: config.PRESSURE_MAX_EVENT_LOOP_DELAY_MS,
      maxEventLoopUtilization: config.PRESSURE_MAX_EVENT_LOOP_UTILIZATION,
      maxHeapUsedBytes: config.PRESSURE_MAX_HEAP_USED_BYTES,
      maxRssBytes: config.PRESSURE_MAX_RSS_BYTES,
      sampleInterval: config.PRESSURE_SAMPLE_INTERVAL_MS,
      pressureHandler: (req, reply, type, value) => {
        // Returning without replying lets the request proceed normally.
        if (req.routeOptions.config?.shed === false) return;

        req.log.warn({ type, value }, "request shed under pressure");
        reply
          .header(Header.RetryAfter, String(config.PRESSURE_RETRY_AFTER_SECONDS))
          .code(HttpStatus.ServiceUnavailable)
          .send(errorBody(req.id, ErrorMessage.Overloaded));
      },
    });
  },
  { name: "pressure" },
);
