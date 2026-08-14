# Endpoints

The gateway exposes two kinds of routes: a few it **serves itself**, and the
service prefixes it **proxies**. This is the `routes/` vs `services/` split
from the [architecture](architecture.md).

## Served by the gateway

| Method | Path | Auth | Rate limited | Description |
| --- | --- | --- | --- | --- |
| GET | `/healthz` | none | no | Liveness. Always `200 {"status":"ok"}` while the process is up. |
| GET | `/readyz` | none | no | Readiness. `200 {"status":"ready"}`, `503 {"status":"draining"}` once shutdown has begun, or `503 {"status":"under-pressure"}` while load shedding. |
| GET | `/metrics` | optional bearer | no | Prometheus metrics. Requires `Authorization: Bearer <METRICS_TOKEN>` when that token is set. |

Health and metrics routes are exempt from rate limiting and load shedding so
probes and scrapes never consume a client budget and an overload can never
fail liveness into a restart loop. Health probes are additionally exempt
from IP filtering; `/metrics` deliberately is not — a blocked scrape is
visible and recoverable. See [Architecture → Request
lifecycle](architecture.md#request-lifecycle) for the full pipeline.

### Examples

```bash
curl -i localhost:8080/healthz
# HTTP/1.1 200 OK
# {"status":"ok"}

curl localhost:8080/readyz
# {"status":"ready"}

curl -H "authorization: Bearer $METRICS_TOKEN" localhost:8080/metrics
# http_requests_total{method="GET",route="/healthz",status="200"} 3
# ...
```

## Proxied services

Each configured service owns a path prefix. A request matching a prefix is
authenticated (per the service's scheme), has its headers rewritten, and is
streamed to the upstream.

| Prefix | Upstream (config) | Edge auth |
| --- | --- | --- |
| `/api/users/*` | `USERS_SERVICE_URL` | API key (`x-api-key`) |
| `/api/orders/*` | `ORDERS_SERVICE_URL` | HTTP Basic |
| `/api/public/*` | `PUBLIC_SERVICE_URL` | none |

These three are the shipped examples; add or replace them per
[Extending](extending.md).

### Path rewriting

The public prefix is stripped before forwarding (`rewritePrefix` defaults to
`/`). Query strings and nested paths are preserved:

```
GET /api/users/me?verbose=1   ->   GET /me?verbose=1        (to USERS_SERVICE_URL)
GET /api/public/v2/items      ->   GET /v2/items            (to PUBLIC_SERVICE_URL)
```

### Headers added to proxied requests

| Header | Value |
| --- | --- |
| `x-request-id` | Per-hop id, honored or generated |
| `x-correlation-id` | Transaction id, honored or derived from the request id |
| `traceparent` | W3C trace context, continued or started |
| `x-forwarded-for` | Client chain (appended when trusted, replaced when not) |
| `x-forwarded-host` | Client `Host` |
| `x-forwarded-proto` | Request protocol |

See [Authentication → Header hygiene](authentication.md#header-hygiene) for
what is stripped, and [Observability](observability.md) for the id semantics.

## Responses

Every error — from the gateway or an upstream failure — uses one shape:

```json
{ "error": "<client-safe message>", "requestId": "<id>" }
```

The full status mapping is in
[Operations → Error semantics](operations.md#error-semantics).
