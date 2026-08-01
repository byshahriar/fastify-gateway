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
  // Resolves req.ip from x-forwarded-for. Correct behind a trusted load
  // balancer; set TRUST_PROXY=false when clients connect directly, or
  // rate-limit keys and forwarded headers become spoofable.
  const trustProxy = envBoolean("TRUST_PROXY", true);

  const app = Fastify({
    logger: {
      // Factory option: read from raw env, @fastify/env has not run yet.
      level: process.env.LOG_LEVEL ?? "info",
      redact: [
        `req.headers.${Header.Authorization}`,
        `req.headers["${Header.ApiKey}"]`,
        `req.headers.${Header.Cookie}`,
      ],
    },
    // Factory option, same reason. Validated to fail fast (bodyLimit must be
    // a positive integer).
    bodyLimit: envNumber("BODY_LIMIT", 1_048_576, 1),
    genReqId: (req) => {
      const incoming = req.headers[Header.RequestId];
      return typeof incoming === "string" && SAFE_HEADER_ID_PATTERN.test(incoming)
        ? incoming
        : randomUUID();
    },
    // Must exceed the idle timeout of the load balancer in front of the
    // gateway so the balancer never reuses a connection the gateway closed.
    keepAliveTimeout: envNumber("KEEP_ALIVE_TIMEOUT_MS", 72_000),
    // Bound the time a single request may take to arrive, so a slow client
    // cannot hold a connection open indefinitely (tighter than Node's ~5min
    // default). 0 disables it.
    requestTimeout: envNumber("REQUEST_TIMEOUT_MS", 30_000),
    trustProxy,
  });

  // Flipped by server.ts on shutdown so readiness reports draining.
  app.decorate("shuttingDown", false);
  // Read by the proxy layer to decide whether incoming x-forwarded-for is
  // trustworthy history (append) or client-forged (replace).
  app.decorate("trustProxy", trustProxy);

  await app.register(env, { schema: configSchema, dotenv: true });

  await app.register(securityPlugin);
  await app.register(requestContextPlugin);
  await app.register(authPlugin);
  await app.register(rateLimitPlugin);
  await app.register(errorHandlerPlugin);
  await app.register(metricsPlugin);

  await app.register(healthRoutes);
  await app.register(metricsRoutes);

  await app.register(usersGateway);
  await app.register(ordersGateway);
  await app.register(publicGateway);

  return app;
}
