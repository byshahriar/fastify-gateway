# Roadmap

This project is a focused, lightweight **edge (north-south) API gateway**. It
covers the cross-cutting concerns a gateway owns and deliberately leaves
platform concerns to the platform. This document makes that scope explicit:
what is done, what is intentionally out of scope, and what may come next.

## Shipped

- Reverse proxy with per-service classes, prefix rewriting, streamed bodies
- Edge auth: API key, HTTP Basic, JWT, and a pluggable strategy registry
- Service-to-service (upstream) authentication
- Rate limiting — per-IP, in-memory or shared via Redis, with optional ban
- Load shedding — event-loop/memory pressure answered with 503 + Retry-After,
  reported on readiness, with probes and /metrics exempt
- Response caching — Cache-Control-aware, Redis-backed, per-service opt-in
- IP allow/deny lists — CIDR-aware, evaluated against the real client IP
- CORS, security headers, uniform error responses
- Distributed tracing (W3C `traceparent`), correlation ids, structured logs
- Prometheus metrics, health/readiness probes, bounded graceful shutdown
- Fail-fast connect/response timeouts and connection pooling
- Schema-validated configuration with fail-fast boot
- Docker image, Compose stack, Kubernetes manifests
- CI/CD (GitHub + GitLab), full test suite, documentation

## Owned by the platform (intentionally not built in)

On Kubernetes — optionally with a service mesh — these are handled outside the
gateway and are **not** planned features. See
[Deployment](docs/deployment.md) and the
[security model](docs/security-model.md).

| Concern | Provided by |
| --- | --- |
| Service discovery | Kubernetes Services + DNS |
| Load balancing across replicas | Kubernetes Services (L4); mesh (L7) |
| Circuit breaking, retries, outlier detection | Service mesh (Istio/Linkerd) |
| mutual TLS between services | Service mesh |
| Traffic splitting / canary / blue-green | Mesh or a rollout controller |
| Config rollout | ConfigMap/Secret + rolling restart |
| Trace span export | Mesh sidecar or an OpenTelemetry collector |

## Candidate features (build when a use case needs them)

These fit the gateway's scope but are not implemented, roughly in priority
order. None are required for the current feature set to be useful.

- **OpenTelemetry span export** — emit spans directly when no mesh is present.
- **Request/response validation** — enforce OpenAPI/JSON-schema at the edge.
- **Per-consumer API keys and quotas** — API-management-style key registry.
- **Additional auth strategies** — mTLS client certs, opaque-token
  introspection (both straightforward via the strategy registry).
- **Response/request transformation** — header and body rewriting hooks.

## Explicit non-goals

The gateway proxies HTTP/1.1. WebSocket and gRPC/HTTP-2 upstream proxying,
a dynamic admin API, and multi-tenancy are out of scope; use a purpose-built
gateway or the service mesh for those.

## Contributing

Proposals for candidate features are welcome — open an issue describing the
use case first (see [CONTRIBUTING.md](CONTRIBUTING.md)). New auth schemes and
per-service behavior are designed to be added without modifying the core; see
[Extending](docs/extending.md).
