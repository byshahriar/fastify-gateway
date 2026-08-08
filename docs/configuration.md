# Configuration

All configuration is supplied through environment variables, either from the
process environment or a `.env` file.

## Loading `.env`

Copy the template and edit it:

```bash
cp .env.example .env
```

The entry point (`server.ts`) loads `.env` into `process.env` with `dotenv`
**before** anything reads it — so every variable is picked up, including the
factory/process options (logging, timeouts, trust proxy, OpenTelemetry) that
are consumed before schema validation runs. Real environment variables take
precedence over `.env`, and a missing `.env` is not an error: in production,
configuration comes from the platform. `.env` is git-ignored; never commit
secrets — commit `.env.example` instead.

## How it works

The schema in `src/config/schema.ts` is validated and type-coerced by
`@fastify/env` at boot. The process **refuses to start** on invalid or
malformed values — configuration mistakes surface immediately, never at
request time. The validated result is exposed as the typed `fastify.config`;
its type (`GatewayConfig`) is derived from the schema itself, so adding a
variable to the schema updates the type everywhere.

A few values are read from the raw environment instead, because they
configure the Fastify factory or the process before the schema plugin runs:
`LOG_LEVEL`, `BODY_LIMIT`, `TRUST_PROXY`, `KEEP_ALIVE_TIMEOUT_MS`,
`REQUEST_TIMEOUT_MS`, and `SHUTDOWN_TIMEOUT_MS`. They are marked as
factory/process options below. These are validated the same way — a
non-numeric timeout or a non-boolean `TRUST_PROXY` fails at boot rather than
silently coercing to a degraded value (for example `NaN` disabling a
timeout).

## Reference

### Server

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `8080` | Listen port |
| `HOST` | `0.0.0.0` | Listen address |
| `LOG_LEVEL` | `info` | Pino log level (factory option) |
| `LOG_DESTINATION` | `console` | Log channels, comma-separated: `console` (stdout), `file` (rotating file), or `console,file` for both. Unknown channels fail at boot (factory option) |
| `LOG_FILE` | `logs/gateway.log` | Base path when `LOG_DESTINATION=file` (factory option) |
| `LOG_ROTATION_FREQUENCY` | `daily` | Time-based rotation: `daily`, `hourly`, or a millisecond interval (factory option) |
| `LOG_ROTATION_MAX_SIZE` | `10m` | Size-based rotation threshold, e.g. `10m` (factory option) |
| `LOG_RETENTION_FILES` | `14` | Number of recent log files to retain; older ones are deleted automatically (factory option) |
| `LOG_BUFFER_BYTES` | `0` | Buffered async stdout writes: batch log lines until this many bytes accumulate. `0` writes synchronously. Orderly shutdown flushes the buffer; a hard crash can lose the tail (factory option) |
| `LOG_REQUEST_STYLE` | `fastify` | Per-request logging: `fastify` (built-in incoming + completed lines), `single` (one structured completion line per request — half the log volume), or `off` (no per-request lines; errors are still logged) (factory option) |
| `SLOW_REQUEST_MS` | `0` | Log a warn-level line for any request slower than this many milliseconds; `0` disables |
| `BODY_LIMIT` | `1048576` | Max body size in bytes for gateway-served routes; proxied bodies are streamed, not buffered (factory option) |
| `TRUST_PROXY` | `true` | Resolve `req.ip` from `x-forwarded-for`. Set `false` when clients connect directly, or rate-limit keys become spoofable (factory option) |
| `KEEP_ALIVE_TIMEOUT_MS` | `72000` | Server keep-alive timeout; keep it above the load balancer's idle timeout (factory option) |
| `REQUEST_TIMEOUT_MS` | `30000` | Max time for a single request to arrive; bounds slow-client attacks. `0` disables (factory option) |
| `SHUTDOWN_TIMEOUT_MS` | `10000` | Grace period for draining in-flight requests before a forced exit (process option) |

### CORS

| Variable | Default | Description |
| --- | --- | --- |
| `CORS_ORIGINS` | `*` | Comma-separated origin allow-list, or `*` for any origin |
| `CORS_ALLOW_CREDENTIALS` | `false` | Send `Access-Control-Allow-Credentials`. Rejected at boot when combined with wildcard origins |

### Edge authentication

| Variable | Default | Description |
| --- | --- | --- |
| `GATEWAY_API_KEY` | — | Shared secret for services using the `api-key` scheme |
| `BASIC_AUTH_USERS` | — | Comma-separated `username:password` pairs for the `basic` scheme |
| `JWT_SECRET` | — | Shared HMAC secret (HS256) for the `jwt` scheme |
| `JWT_JWKS_URI` | — | Remote JWKS endpoint (RS256/ES256) for the `jwt` scheme |
| `JWT_ISSUER` | — | Required `iss` claim for the `jwt` scheme, if set |
| `JWT_AUDIENCE` | — | Required `aud` claim for the `jwt` scheme, if set |
| `BEARER_INTROSPECTION_URL` | — | Introspection endpoint for the `bearer` scheme; POSTs `{ token }`, expects `{ active }` |
| `BEARER_INTROSPECTION_TOKEN` | — | Optional bearer token the gateway presents to the introspection endpoint |
| `BEARER_CACHE_TTL_MS` | `0` | Cache active-token introspection decisions for this many ms; `0` introspects every request. A revoked token stays accepted until its cached entry expires — keep it short |

`BASIC_AUTH_USERS` entries are parsed at boot; a malformed entry (missing
colon, empty username or password) or a duplicate username prevents
startup. Passwords may contain
colons; usernames may not. A service whose scheme is enabled but whose
credential source is empty responds `500 Gateway misconfigured` instead of
allowing traffic — see [Authentication](authentication.md).

### Observability

| Variable | Default | Description |
| --- | --- | --- |
| `METRICS_TOKEN` | — | Bearer token required to scrape `GET /metrics`. Empty leaves the endpoint open — protect it with network policy in that case |
| `ALERTS_ENABLED` | `false` | Feature flag for chat alerts on 5xx responses |
| `ALERT_CHANNEL` | `none` | Active alert channel: `none`, `slack`, or `discord` |
| `ALERT_LEVEL` | `error` | Lowest level to alert on: `error` (5xx) or `warn` (4xx + 5xx) |
| `SLACK_WEBHOOK_URL` | — | Slack incoming-webhook URL (used when `ALERT_CHANNEL=slack`) |
| `DISCORD_WEBHOOK_URL` | — | Discord webhook URL (used when `ALERT_CHANNEL=discord`) |
| `ALERT_THROTTLE_MS` | `60000` | Minimum interval between alert notifications |
| `ALERT_RETRIES` | `2` | Retries (beyond the first attempt) for webhook delivery, with exponential backoff |
| `OTEL_ENABLED` | `false` | Feature flag for OpenTelemetry tracing (process option) |
| `OTEL_SERVICE_NAME` | `fastify-gateway` | Service name on emitted spans (process option) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | — | OTLP collector endpoint; read by the OTel SDK (process option) |

### IP filtering

Evaluated against the real client IP (see `TRUST_PROXY`). Entries are plain
IPs or CIDR ranges, IPv4 and IPv6; an invalid entry prevents startup. Health
probes are never filtered, so a misconfigured list cannot fail liveness.

| Variable | Default | Description |
| --- | --- | --- |
| `IP_ALLOW_LIST` | — | Comma-separated IPs/CIDRs. When non-empty, clients it does not match receive `403` |
| `IP_DENY_LIST` | — | Comma-separated IPs/CIDRs blocked outright with `403`; wins over the allow list |

### Load shedding

While any configured threshold is exceeded, requests are answered
`503` + `Retry-After` instead of queueing, `/readyz` reports
`under-pressure` so orchestrators route traffic away, and health probes and
`/metrics` keep responding. `0` disables an individual check.

| Variable | Default | Description |
| --- | --- | --- |
| `PRESSURE_MAX_EVENT_LOOP_DELAY_MS` | `1000` | Shed when the sampled event-loop delay exceeds this |
| `PRESSURE_MAX_EVENT_LOOP_UTILIZATION` | `0.98` | Shed when event-loop utilization (0–1) exceeds this |
| `PRESSURE_MAX_HEAP_USED_BYTES` | `0` | Shed when heap usage exceeds this; `0` disables |
| `PRESSURE_MAX_RSS_BYTES` | `0` | Shed when RSS exceeds this; `0` disables |
| `PRESSURE_SAMPLE_INTERVAL_MS` | `1000` | Sampling interval for the checks above |
| `PRESSURE_RETRY_AFTER_SECONDS` | `10` | `Retry-After` value on shed responses |

### Response caching

Shared, `Cache-Control`-aware caching for services that opt in via
`cacheable` (currently the public service). Requires `REDIS_URL` — enabling
it without one fails at boot. Only unauthenticated `GET` 200-responses are
cached; TTL follows the upstream's `s-maxage`/`max-age`. Hits carry
`x-cache: HIT`. Redis errors and slow lookups fail open.

| Variable | Default | Description |
| --- | --- | --- |
| `CACHE_ENABLED` | `false` | Feature flag for response caching |
| `CACHE_MAX_TTL_MS` | `60000` | Upper bound on any entry's TTL, regardless of upstream headers |
| `CACHE_DEFAULT_TTL_MS` | `0` | TTL when the upstream sends no `Cache-Control`; `0` caches only what upstreams opt into |
| `CACHE_MAX_BODY_BYTES` | `1048576` | Bodies larger than this are streamed through and not cached |

### Rate limiting

| Variable | Default | Description |
| --- | --- | --- |
| `RATE_LIMIT_MAX` | `100` | Requests allowed per window per client IP |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Window length in milliseconds |
| `RATE_LIMIT_BAN` | `0` | Ban a client IP after this many consecutive over-limit responses; `0` disables |
| `REDIS_URL` | — | Redis connection string for a shared rate-limit store across replicas; empty uses the in-memory store |

### Upstream connections

| Variable | Default | Description |
| --- | --- | --- |
| `UPSTREAM_TIMEOUT_MS` | `10000` | Response timeout (headers and body) |
| `UPSTREAM_CONNECT_TIMEOUT_MS` | `2000` | TCP connect timeout |
| `UPSTREAM_MAX_CONNECTIONS` | `128` | Connection-pool size per upstream |

### Services

Service URLs must start with `http://` or `https://`; anything else is
rejected at boot.

| Variable | Default | Description |
| --- | --- | --- |
| `USERS_SERVICE_URL` | `http://localhost:3001` | Users upstream base URL |
| `USERS_SERVICE_BASIC_AUTH` | — | Optional `username:password` presented to the users upstream |
| `ORDERS_SERVICE_URL` | `http://localhost:3002` | Orders upstream base URL |
| `ORDERS_SERVICE_BASIC_AUTH` | — | Optional `username:password` presented to the orders upstream |
| `PUBLIC_SERVICE_URL` | `http://localhost:3003` | Public upstream base URL |

## Adding configuration

1. Add the property to `src/config/schema.ts` with a type and default.
2. Done — `GatewayConfig` picks it up automatically, and it is available as
   `fastify.config.<NAME>` everywhere.

Never read `process.env` directly outside the Fastify factory options in
`app.ts`; the schema is the single source of truth.
