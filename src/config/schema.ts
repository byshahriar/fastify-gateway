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

    // JWT (`jwt` auth scheme) verification. Provide either a shared HMAC
    // secret or a remote JWKS URI; issuer and audience are optional claims
    // to enforce.
    JWT_SECRET: { type: "string", default: "" },
    JWT_JWKS_URI: { type: "string", default: "" },
    JWT_ISSUER: { type: "string", default: "" },
    JWT_AUDIENCE: { type: "string", default: "" },

    // Bearer (`bearer` auth scheme): validate opaque tokens against your own
    // auth service's introspection endpoint. BEARER_INTROSPECTION_TOKEN, if
    // set, authenticates the gateway to that endpoint. BEARER_CACHE_TTL_MS
    // caches active-token decisions for that many ms (0 disables caching);
    // a revoked token stays accepted until its cached entry expires.
    BEARER_INTROSPECTION_URL: { type: "string", default: "" },
    BEARER_INTROSPECTION_TOKEN: { type: "string", default: "" },
    BEARER_CACHE_TTL_MS: { type: "number", default: 0 },

    // Log a warn-level line for any request slower than this many
    // milliseconds. 0 disables. See plugins/logging.ts.
    SLOW_REQUEST_MS: { type: "number", default: 0 },

    // IP filtering, evaluated against the real client IP (see TRUST_PROXY).
    // Comma-separated IPs or CIDR ranges, IPv4 and IPv6. A non-empty allow
    // list blocks every client it does not match; the deny list blocks its
    // matches outright and wins over the allow list. Empty disables a list.
    IP_ALLOW_LIST: { type: "string", default: "" },
    IP_DENY_LIST: { type: "string", default: "" },

    // Load shedding. Requests arriving while the event loop or memory is over
    // these thresholds are answered 503 + Retry-After instead of queueing
    // behind work the instance cannot absorb. A value of 0 disables that
    // individual check. Health probes and /metrics are exempt.
    PRESSURE_MAX_EVENT_LOOP_DELAY_MS: { type: "number", default: 1000 },
    PRESSURE_MAX_EVENT_LOOP_UTILIZATION: { type: "number", default: 0.98 },
    PRESSURE_MAX_HEAP_USED_BYTES: { type: "number", default: 0 },
    PRESSURE_MAX_RSS_BYTES: { type: "number", default: 0 },
    PRESSURE_SAMPLE_INTERVAL_MS: { type: "number", default: 1000 },
    PRESSURE_RETRY_AFTER_SECONDS: { type: "number", default: 10 },

    // Response caching (feature flag) for services that opt in via
    // `cacheable`. Requires REDIS_URL so entries are shared across replicas.
    // TTL comes from the upstream's Cache-Control (s-maxage/max-age), capped
    // by CACHE_MAX_TTL_MS; CACHE_DEFAULT_TTL_MS applies when the upstream
    // sends no Cache-Control (0 = cache only when the upstream opts in).
    // Bodies over CACHE_MAX_BODY_BYTES are never cached.
    CACHE_ENABLED: { type: "boolean", default: false },
    CACHE_MAX_TTL_MS: { type: "number", default: 60000 },
    CACHE_DEFAULT_TTL_MS: { type: "number", default: 0 },
    CACHE_MAX_BODY_BYTES: { type: "number", default: 1048576 },

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

    // Chat-channel alerting (feature flag). When enabled, a 5xx response
    // triggers a throttled notification to the single active channel selected
    // by ALERT_CHANNEL, using that channel's webhook URL.
    ALERTS_ENABLED: { type: "boolean", default: false },
    ALERT_CHANNEL: { type: "string", enum: ["none", "slack", "discord"], default: "none" },
    // Lowest response class to alert on: "error" (5xx) or "warn" (4xx + 5xx).
    ALERT_LEVEL: { type: "string", enum: ["error", "warn"], default: "error" },
    SLACK_WEBHOOK_URL: { type: "string", default: "" },
    DISCORD_WEBHOOK_URL: { type: "string", default: "" },
    ALERT_THROTTLE_MS: { type: "number", default: 60000 },
    // Retries (beyond the first attempt) for webhook delivery, with
    // exponential backoff. 0 disables retrying.
    ALERT_RETRIES: { type: "number", default: 2 },

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
