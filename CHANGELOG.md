# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-08-13

### Security

- Validate factory options read from raw env (`BODY_LIMIT`,
  `KEEP_ALIVE_TIMEOUT_MS`, `REQUEST_TIMEOUT_MS`, `SHUTDOWN_TIMEOUT_MS`,
  `TRUST_PROXY`) so a malformed value fails fast instead of silently
  disabling a control
- Strip credentials embedded in a service URL from the boot log

### Added

- Proxy core: per-service gateway classes with prefix rewriting, streamed
  bodies, undici connection pooling, and fail-fast connect/response timeouts
- Edge authentication: API key (`x-api-key`) and HTTP Basic schemes with
  constant-time comparison, plus a pluggable strategy registry for custom
  schemes
- Service-to-service authentication: per-upstream Basic credentials injected
  by the gateway, with client-credential stripping
- Distributed tracing: W3C `traceparent` continuation, `x-request-id` and
  `x-correlation-id` handling, ids bound into all request logs and echoed on
  responses
- Uniform error semantics: upstream failures mapped to `502`/`504`, internal
  details never exposed, every error body carrying the request id
- Per-IP rate limiting with health-probe exemption, CORS allow-list, helmet
  security headers, credential redaction in logs
- Schema-validated configuration with fail-fast boot and a schema-derived
  config type
- Prometheus metrics at `/metrics`: request counters and duration histograms
  labeled by method, route pattern, and status
- Readiness draining and bounded graceful shutdown for rolling deploys
- Multi-stage Docker image and a Compose topology with demo upstreams
- Test suite: unit, integration (real HTTP upstream stubs), and a live
  end-to-end suite that exercises the compiled build
- Documentation set under `docs/`, CI on Node.js 20, 22, and 24 with
  enforced coverage thresholds
