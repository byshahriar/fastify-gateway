/**
 * Environment schema, validated and type-coerced by `@fastify/env` at boot
 * and exposed as the typed `fastify.config`. The process refuses to start on
 * invalid configuration. The `GatewayConfig` type in
 * `types/gateway-config.type.ts` is derived from this schema, so adding a
 * property here updates the type everywhere.
 *
 * `LOG_LEVEL` and `BODY_LIMIT` are read from raw env in `app.ts` because they
 * configure the Fastify factory itself, before this plugin runs.
 */
export const configSchema = {
  type: "object",
  properties: {
    PORT: { type: "number", default: 8080 },
    HOST: { type: "string", default: "0.0.0.0" },

    // Comma-separated origin allow-list; `"*"` allows any origin.
    CORS_ORIGINS: { type: "string", default: "*" },
    CORS_ALLOW_CREDENTIALS: { type: "boolean", default: false },

    // Shared secret for services using the `api-key` auth scheme.
    GATEWAY_API_KEY: { type: "string", default: "" },

    // Comma-separated `username:password` pairs for the `basic` auth scheme.
    BASIC_AUTH_USERS: { type: "string", default: "" },

    RATE_LIMIT_MAX: { type: "number", default: 100 },
    RATE_LIMIT_WINDOW_MS: { type: "number", default: 60000 },

    // Number of consecutive over-limit requests after which a client IP is
    // temporarily banned (escalating brute-force friction). 0 disables.
    RATE_LIMIT_BAN: { type: "number", default: 0 },

    // Redis connection string for a shared rate-limit store across replicas.
    // Empty uses the in-memory store (correct for a single instance).
    REDIS_URL: { type: "string", default: "" },

    // Bearer token required to scrape GET /metrics. Empty leaves the endpoint
    // open — protect it with network policy in that case.
    METRICS_TOKEN: { type: "string", default: "" },

    UPSTREAM_TIMEOUT_MS: { type: "number", default: 10000 },
    UPSTREAM_CONNECT_TIMEOUT_MS: { type: "number", default: 2000 },
    UPSTREAM_MAX_CONNECTIONS: { type: "number", default: 128 },

    /**
     * One base URL per service, plus optional `username:password` credentials
     * the gateway uses to authenticate against that upstream.
     */
    USERS_SERVICE_URL: {
      type: "string",
      pattern: "^https?://",
      default: "http://localhost:3001",
    },
    USERS_SERVICE_BASIC_AUTH: { type: "string", default: "" },
    ORDERS_SERVICE_URL: {
      type: "string",
      pattern: "^https?://",
      default: "http://localhost:3002",
    },
    ORDERS_SERVICE_BASIC_AUTH: { type: "string", default: "" },
    PUBLIC_SERVICE_URL: {
      type: "string",
      pattern: "^https?://",
      default: "http://localhost:3003",
    },
  },
} as const;
