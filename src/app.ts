import Fastify from "fastify";
import env from "@fastify/env";
import { randomUUID } from "node:crypto";
import { configSchema } from "@/config/schema";
import { envBoolean, envNumber } from "@/config/env";
import { Header, SAFE_HEADER_ID_PATTERN } from "@/constants";
import securityPlugin from "@/plugins/security";
import requestContextPlugin from "@/plugins/request-context";
import authPlugin from "@/plugins/auth";
import rateLimitPlugin from "@/plugins/rate-limit";
import errorHandlerPlugin from "@/plugins/error-handler";
import metricsPlugin from "@/plugins/metrics";
import alertsPlugin from "@/plugins/alerts";
import healthRoutes from "@/routes/health";
import metricsRoutes from "@/routes/metrics";
import usersGateway from "@/services/users.gateway";
import ordersGateway from "@/services/orders.gateway";
import publicGateway from "@/services/public.gateway";

/**
 * Builds the gateway application. Registration order is load-bearing:
 *
 * 1. `env` — validates configuration and decorates `fastify.config`.
 * 2. Plugins — cross-cutting concerns, fp-wrapped so they apply app-wide.
 * 3. Routes — endpoints the gateway serves itself.
 * 4. Services — one encapsulated proxy per upstream.
 *
 * Fastify readies each awaited subtree before the next starts, so services
 * can rely on `fastify.config` and the auth decorators existing.
 *
 * @returns The configured, not-yet-listening Fastify instance.
 */
export async function buildApp() {
  const trustProxy = envBoolean("TRUST_PROXY", true);

  // These options configure the Fastify factory, so they read from raw env
  // before @fastify/env runs; envNumber/envBoolean fail fast on bad values.
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      redact: [
        `req.headers.${Header.Authorization}`,
        `req.headers["${Header.ApiKey}"]`,
        `req.headers.${Header.Cookie}`,
      ],
    },
    bodyLimit: envNumber("BODY_LIMIT", 1_048_576, 1),
    genReqId: (req) => {
      const incoming = req.headers[Header.RequestId];
      return typeof incoming === "string" && SAFE_HEADER_ID_PATTERN.test(incoming)
        ? incoming
        : randomUUID();
    },
    keepAliveTimeout: envNumber("KEEP_ALIVE_TIMEOUT_MS", 72_000),
    requestTimeout: envNumber("REQUEST_TIMEOUT_MS", 30_000),
    trustProxy,
  });

  app.decorate("shuttingDown", false);
  app.decorate("trustProxy", trustProxy);

  await app.register(env, { schema: configSchema, dotenv: true });

  await app.register(securityPlugin);
  await app.register(requestContextPlugin);
  await app.register(authPlugin);
  await app.register(rateLimitPlugin);
  await app.register(errorHandlerPlugin);
  await app.register(metricsPlugin);
  await app.register(alertsPlugin);

  await app.register(healthRoutes);
  await app.register(metricsRoutes);

  await app.register(usersGateway);
  await app.register(ordersGateway);
  await app.register(publicGateway);

  return app;
}
