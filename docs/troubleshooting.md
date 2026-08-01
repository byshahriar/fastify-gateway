# Troubleshooting

Common problems and what causes them. Each error the gateway returns includes
a `requestId`; grep your logs for it (or the `correlationId`) to find the full
context.

## The gateway won't start

The process validates configuration at boot and exits rather than run
misconfigured. The error message names the offending variable.

| Message contains | Cause | Fix |
| --- | --- | --- |
| `CORS_ALLOW_CREDENTIALS … wildcard` | Credentials enabled with `CORS_ORIGINS=*` | Set an explicit origin allow-list |
| `Duplicate username in BASIC_AUTH_USERS` | Same username twice | Remove the duplicate |
| `Invalid BASIC_AUTH_USERS entry` | Missing colon or empty part | Use `user:pass` pairs |
| `must match pattern "^https?://"` | A `*_SERVICE_URL` is not an http(s) URL | Provide a full URL |
| `Invalid REQUEST_TIMEOUT_MS` (or similar) | A numeric factory option isn't a number | Provide a valid number |
| `Invalid TRUST_PROXY` | Not `true`/`false` | Use `true` or `false` |
| `unknown level` | Bad `LOG_LEVEL` | Use a valid pino level |

## Requests return 401

- **API-key service** — the `x-api-key` header is missing or wrong. Compared
  in constant time; a case difference is a mismatch.
- **Basic-auth service** — missing/wrong credentials, or an unknown user. The
  response includes a `WWW-Authenticate: Basic` challenge.
- **`/metrics`** — `METRICS_TOKEN` is set and the `Authorization: Bearer`
  token is missing or wrong.

## Requests return 500 "Gateway misconfigured"

A service requires an auth scheme whose credential source is empty:

- API-key service with `GATEWAY_API_KEY` unset.
- Basic-auth service with `BASIC_AUTH_USERS` unset.

Set the missing secret. This is fail-closed behavior — the gateway will not
proxy unauthenticated traffic.

## Requests return 502 / 504

| Status | Meaning | Check |
| --- | --- | --- |
| `502 Upstream unavailable` | Can't reach the upstream | Is `*_SERVICE_URL` correct and the upstream up? DNS resolvable from the gateway? |
| `504 Upstream timeout` | Upstream too slow | Raise `UPSTREAM_TIMEOUT_MS`, or fix the slow upstream |

See the [error mapping](operations.md#error-semantics) for the full decision
tree.

## Rate limiting is too strict or too loose

- Tune `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_MS`.
- **Behind a load balancer** — if every client shares one apparent IP, confirm
  `TRUST_PROXY=true` and that the proxy sets `x-forwarded-for`.
- **Running replicas** — limits are per-instance and multiply by replica count
  until you wire the Redis store (see [Operations](operations.md#rate-limiting)).

## CORS requests are blocked in the browser

- The origin must be in `CORS_ORIGINS` exactly (scheme + host + port).
- For credentialed requests, set `CORS_ALLOW_CREDENTIALS=true` **and** an
  explicit origin list — the wildcard + credentials combination is rejected at
  boot.

## Traces or correlation ids look wrong

- An incoming `x-request-id` or `x-correlation-id` outside the safe character
  set (`[\w.-]{1,128}`) is replaced with a generated id by design.
- `tracestate` is dropped when the gateway starts a new trace (no valid
  incoming `traceparent`); this is intentional. See
  [Observability](observability.md).

## Shutdown seems abrupt

`SHUTDOWN_TIMEOUT_MS` bounds the drain; if in-flight requests exceed it the
process force-exits. Raise it (but keep it under the orchestrator's kill
grace period), or investigate a hung upstream holding connections open.

## Still stuck?

Open a bug report with the reproduction steps, your Node.js version, and the
relevant log lines (redact secrets) — see the issue template.
