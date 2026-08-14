import Fastify, { LogController } from "fastify";
import env from "@fastify/env";
import { randomUUID } from "node:crypto";
import { configSchema } from "@/config/schema";
import { envBoolean, envEnum, envNumber } from "@/config/env";
import { buildLoggerOptions } from "@/config/logger";
import { Header, SAFE_HEADER_ID_PATTERN } from "@/constants";
import { LogRequestStyle } from "@/enums";
import securityPlugin from "@/plugins/security";
import requestContextPlugin from "@/plugins/request-context";
import loggingPlugin from "@/plugins/logging";
import ipFilterPlugin from "@/plugins/ip-filter";
import pressurePlugin from "@/plugins/pressure";
import authPlugin from "@/plugins/auth";
import redisPlugin from "@/plugins/redis";
import rateLimitPlugin from "@/plugins/rate-limit";
import cachePlugin from "@/plugins/cache";
import errorHandlerPlugin from "@/plugins/error-handler";
import metricsPlugin from "@/plugins/metrics";
import alertsPlugin from "@/plugins/alerts";
import healthRoutes from "@/routes/health";
import metricsRoutes from "@/routes/metrics";
import usersGateway from "@/gateways/users.gateway";
import ordersGateway from "@/gateways/orders.gateway";
import publicGateway from "@/gateways/public.gateway";

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
  const requestLogStyle = envEnum(
    "LOG_REQUEST_STYLE",
    Object.values(LogRequestStyle),
    LogRequestStyle.Fastify,
  );

  // These options configure the Fastify factory, so they read from raw env
  // before @fastify/env runs; envNumber/envBoolean fail fast on bad values.
  const app = Fastify({
    logger: await buildLoggerOptions(),
    // `single` and `off` replace Fastify's built-in two-line request
    // logging; the logging plugin emits the replacement line for `single`.
    logController: new LogController({
      disableRequestLogging: requestLogStyle !== LogRequestStyle.Fastify,
    }),
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

  // .env is loaded by the entry point (server.ts) before the factory runs, so
  // @fastify/env only validates and type-coerces what is already in the
  // environment.
  await app.register(env, { schema: configSchema });

  await app.register(securityPlugin);
  await app.register(requestContextPlugin);
  // After request-context so completion lines carry correlation ids.
  await app.register(loggingPlugin);
  // Filtering and shedding sit after request-context so their rejections
  // carry correlation ids, and before auth/rate-limit so blocked or
  // overloaded traffic is rejected on the cheapest path.
  await app.register(ipFilterPlugin);
  await app.register(pressurePlugin);
  await app.register(authPlugin);
  await app.register(redisPlugin);
  await app.register(rateLimitPlugin);
  await app.register(cachePlugin);
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
