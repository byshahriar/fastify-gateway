import "fastify";
import type { Registry } from "prom-client";
import type { AuthScheme } from "@/enums";
import type { GatewayCache } from "@/interfaces";
import type { AuthStrategy } from "@/types/auth-strategy.type";
import type { GatewayConfig } from "@/types/gateway-config.type";

/**
 * Type declarations for decorators added at runtime:
 *
 * - `config` — from `@fastify/env`, typed by the schema-derived
 *   {@link GatewayConfig}.
 * - `shuttingDown` — from `app.ts`, flipped by `server.ts` on shutdown.
 * - `trustProxy` — from `app.ts`, whether `x-forwarded-for` is trusted.
 * - `metricsRegistry` — from `plugins/metrics.ts`.
 * - `registerAuthStrategy`, `authStrategy` — from `plugins/auth.ts`.
 * - `correlationId`, `traceId` — from `plugins/request-context.ts`.
 */
declare module "fastify" {
  interface FastifyInstance {
    config: GatewayConfig;
    /**
     * True once shutdown has begun; readiness reports draining.
     */
    shuttingDown: boolean;
    /**
     * Whether the incoming `x-forwarded-for` chain is trusted.
     */
    trustProxy: boolean;
    /**
     * Per-instance Prometheus registry, served by the /metrics route.
     */
    metricsRegistry: Registry;
    /**
     * Adds the guard for an auth scheme. Throws when the scheme already has
     * one, so overrides are always explicit.
     */
    registerAuthStrategy(scheme: AuthScheme, strategy: AuthStrategy): void;
    /**
     * Resolves the guard for a scheme; `undefined` when none is registered.
     */
    authStrategy(scheme: AuthScheme): AuthStrategy | undefined;
    /**
     * Response-cache hook factories, from `plugins/cache.ts`. Absent when
     * `CACHE_ENABLED` is false.
     */
    gatewayCache: GatewayCache | undefined;
  }

  interface FastifyContextConfig {
    /**
     * Set to `false` to exempt a route from load shedding (health probes,
     * /metrics). See `plugins/pressure.ts`.
     */
    shed?: boolean;
    /**
     * Set to `false` to exempt a route from IP filtering (health probes).
     * See `plugins/ip-filter.ts`.
     */
    ipFilter?: boolean;
  }

  interface FastifyRequest {
    /**
     * Correlation id honored from `x-correlation-id`, or the request id.
     */
    correlationId: string;
    /**
     * W3C trace id this request participates in.
     */
    traceId: string;
    /**
     * Response-cache key when this request is cache-eligible, set by the
     * cache plugin's serve hook and consumed by its store hook. Empty when
     * the request must not be stored (ineligible, or already a hit).
     */
    cacheKey: string;
  }
}
