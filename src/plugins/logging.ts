import fp from "fastify-plugin";
import { envEnum } from "@/config/env";
import { flushLogDestinations } from "@/config/logger";

/**
 * The per-request logging styles `LOG_REQUEST_STYLE` selects from.
 */
export const REQUEST_LOG_STYLES = ["fastify", "single", "off"] as const;

/**
 * Logging plugin. The pino instance itself must be created with the Fastify
 * factory (see `config/logger.ts`) — before any plugin runs — so this plugin
 * owns every logging concern that is hook-based:
 *
 * - Flushes buffered in-process log destinations on `onClose`, so embedded
 *   apps and tests get the same no-lost-tail guarantee as the server entry
 *   point's exit paths.
 * - `LOG_REQUEST_STYLE=single` replaces Fastify's two per-request lines
 *   (incoming + completed) with one structured completion line — half the
 *   log volume at gateway request rates — carrying method, url, matched
 *   route, status, duration, and client IP. `off` logs nothing per request;
 *   errors are still logged by the error handler. The factory reads the same
 *   variable to disable Fastify's built-in request logging (`app.ts`).
 * - `SLOW_REQUEST_MS` (schema-validated) warns on requests slower than the
 *   threshold, so latency outliers are visible without tracing.
 *
 * Both hooks read `req.log`, which request-context has already bound to the
 * request's correlation and trace ids.
 */
export default fp(
  async (fastify) => {
    fastify.addHook("onClose", async () => {
      flushLogDestinations();
    });

    const style = envEnum("LOG_REQUEST_STYLE", REQUEST_LOG_STYLES, "fastify");
    if (style === "single") {
      fastify.addHook("onResponse", async (req, reply) => {
        req.log.info(
          {
            method: req.method,
            url: req.url,
            route: req.routeOptions.url,
            statusCode: reply.statusCode,
            elapsedMs: Math.round(reply.elapsedTime * 10) / 10,
            ip: req.ip,
          },
          "request completed",
        );
      });
    }

    const slowMs = fastify.config.SLOW_REQUEST_MS;
    if (slowMs > 0) {
      fastify.addHook("onResponse", async (req, reply) => {
        if (reply.elapsedTime >= slowMs) {
          req.log.warn(
            {
              method: req.method,
              route: req.routeOptions.url,
              statusCode: reply.statusCode,
              elapsedMs: Math.round(reply.elapsedTime * 10) / 10,
            },
            "slow request",
          );
        }
      });
    }
  },
  { name: "logging" },
);
