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
| `LOG_DESTINATION` | `console` | Log channel: `console` (stdout) or `file` (rotating file) (factory option) |
| `LOG_FILE` | `logs/gateway.log` | Base path when `LOG_DESTINATION=file` (factory option) |
| `LOG_ROTATION_FREQUENCY` | `daily` | Time-based rotation: `daily`, `hourly`, or a millisecond interval (factory option) |
| `LOG_ROTATION_MAX_SIZE` | `10m` | Size-based rotation threshold, e.g. `10m` (factory option) |
| `LOG_RETENTION_FILES` | `14` | Number of recent log files to retain; older ones are deleted automatically (factory option) |
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
