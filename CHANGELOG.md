# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-08-14

Initial release.

### Added

- Proxy core: per-service gateway classes with prefix rewriting, streamed
  bodies, undici connection pooling, and fail-fast connect/response timeouts
- Edge authentication: API key (`x-api-key`), HTTP Basic, JWT (HMAC or JWKS),
  and Bearer (opaque-token introspection against your own auth service)
  schemes, plus a pluggable strategy registry for custom schemes
- Service-to-service authentication: per-upstream Basic credentials injected
  by the gateway, with client-credential stripping
- Distributed tracing: W3C `traceparent` continuation, `x-request-id` and
  `x-correlation-id` handling, ids bound into all request logs and echoed on
  responses
- Uniform error semantics: upstream failures mapped to `502`/`504`, internal
  details never exposed, every error body carrying the request id
- Rate limiting: per-IP budget with an optional escalating ban
  (`RATE_LIMIT_BAN`), in-memory by default or shared across replicas via
  Redis (`REDIS_URL`); a Redis outage fails open rather than hanging or
  throttling unexpectedly
- Load shedding (`@fastify/under-pressure`): requests arriving while the
  event loop or memory is over threshold are answered `503` with
  `Retry-After`; readiness reports `under-pressure`; health probes and
  `/metrics` stay responsive so an overload can never trigger a restart loop
- Response caching (feature flag `CACHE_ENABLED`): shared,
  `Cache-Control`-aware Redis-backed caching for services that opt in, with
  conservative shared-cache semantics and fail-open Redis handling
- IP allow/deny filtering (`IP_ALLOW_LIST` / `IP_DENY_LIST`): CIDR-aware,
  IPv4 and IPv6, evaluated against the real client IP; health probes are
  never filtered
- Structured JSON logging (Pino) with ISO-8601 timestamps and level labels,
  a selectable console and/or rotating-file channel (`LOG_DESTINATION`) with
  size/interval rotation and automatic retention, buffered asynchronous
  stdout writes for high-throughput deployments (`LOG_BUFFER_BYTES`), a
  single-line-per-request logging mode (`LOG_REQUEST_STYLE`), and
  slow-request warnings (`SLOW_REQUEST_MS`)
- Prometheus metrics at `/metrics`: request counters and duration histograms
  labeled by method, route pattern, and status
- Optional chat alerting to a single selected channel (`ALERT_CHANNEL`:
  Slack or Discord) at a configurable level (`ALERT_LEVEL`: error/5xx or
  warn/4xx+5xx), with retried, timeout-bounded webhook delivery
  (`ALERT_RETRIES`) that never blocks the response, behind the
  `ALERTS_ENABLED` flag
- Optional OpenTelemetry tracing export (feature flag `OTEL_ENABLED`),
  dynamically loaded only when enabled
- CORS allow-list, Helmet security headers, and credential redaction in logs
- Schema-validated configuration with fail-fast boot and a schema-derived
  config type; `.env` loaded via dotenv at startup so factory options are
  honored too
- Readiness draining and bounded graceful shutdown for rolling deploys
- Multi-stage Docker image and a Compose topology with demo upstreams
- GitHub Actions automation: CI (with a Docker build smoke test), CodeQL
  scanning, dependency review, Dependabot, and a tag-driven GHCR release
- GitLab CI/CD pipeline mirroring the GitHub workflows (test matrix, Docker
  build, tag release to the container registry, SAST and dependency
  scanning)
- Husky pre-commit hook running lint-staged (ESLint + Prettier) on staged
  TypeScript
- SonarQube scanner configuration and CI workflow; LCOV coverage output, plus
  an optional local SonarQube server via Docker Compose
- Makefile and `scripts/tasks.sh` task runners wrapping the common commands
- Test suite: unit, integration (real HTTP upstream stubs), and a live
  end-to-end suite that exercises the compiled build
- Documentation set under `docs/` (getting started, architecture,
  configuration, endpoints, authentication, observability, security model,
  operations, deployment, troubleshooting, extending, testing), with CI on
  Node.js 20, 22, and 24 and enforced coverage thresholds

### Security

- Every credential comparison (API key, Basic auth, bearer/metrics tokens)
  runs in constant time over hashed inputs, so timing reveals neither
  content nor length, and Basic-auth timing does not reveal whether a
  username exists
- The gateway's edge credential (`x-api-key`) is never forwarded upstream;
  client `Authorization` is stripped when consumed by edge auth or replaced
  by upstream credentials
- Correlation and trace identifiers are validated against a safe character
  set before being logged or forwarded, preventing log/header injection
- Wildcard CORS origins combined with credentials are rejected at boot,
  rather than silently reflecting any origin on credentialed requests
- Factory options read from raw env (`BODY_LIMIT`, `KEEP_ALIVE_TIMEOUT_MS`,
  `REQUEST_TIMEOUT_MS`, `SHUTDOWN_TIMEOUT_MS`, `TRUST_PROXY`) are validated
  so a malformed value fails fast instead of silently disabling a control
- Credentials embedded in a service URL are stripped from the boot log
