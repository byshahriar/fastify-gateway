# Configuration

All configuration is supplied through environment variables, either from the
process environment or a `.env` file (`cp .env.example .env`).

## How it works

The schema in `src/config/schema.ts` is validated and type-coerced by
`@fastify/env` at boot. The process **refuses to start** on invalid or
malformed values — configuration mistakes surface immediately, never at
request time. The validated result is exposed as the typed `fastify.config`;
its type (`GatewayConfig`) is derived from the schema itself, so adding a
variable to the schema updates the type everywhere.

A few values are read from the raw environment instead, because they
configure the Fastify factory or the process before the schema plugin runs:
`LOG_LEVEL`, `BODY_LIMIT`, `TRUST_PROXY`, `KEEP_ALIVE_TIMEOUT_MS`, and
`SHUTDOWN_TIMEOUT_MS`. They are marked as factory/process options below.

## Reference

### Server

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `8080` | Listen port |
| `HOST` | `0.0.0.0` | Listen address |
| `LOG_LEVEL` | `info` | Pino log level (factory option) |
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

### Rate limiting

| Variable | Default | Description |
| --- | --- | --- |
| `RATE_LIMIT_MAX` | `100` | Requests allowed per window per client IP |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Window length in milliseconds |
| `RATE_LIMIT_BAN` | `0` | Ban a client IP after this many consecutive over-limit responses; `0` disables |

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
