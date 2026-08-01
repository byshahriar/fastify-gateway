# Documentation

Guides for using, operating, and extending fastify-gateway. Start with the
[project README](../README.md) for a one-minute overview.

## By task

**Getting the gateway running**

- [Getting Started](getting-started.md) — install, configure, run, verify
- [Configuration](configuration.md) — every environment variable and its validation
- [Endpoints](endpoints.md) — the routes the gateway serves and how it proxies

**Understanding how it works**

- [Architecture](architecture.md) — layout, request lifecycle, design decisions
- [Authentication](authentication.md) — edge schemes, upstream credentials, custom strategies
- [Observability](observability.md) — request ids, trace propagation, logging, metrics
- [Security Model](security-model.md) — trust boundaries and responsibilities

**Running it in production**

- [Operations](operations.md) — error semantics, timeouts, rate limiting, scaling
- [Deployment](deployment.md) — Docker, Compose, and Kubernetes
- [Troubleshooting](troubleshooting.md) — common problems and their causes

**Changing it**

- [Extending](extending.md) — adding services, override points, new auth schemes
- [Testing](testing.md) — test layers, running, writing tests
- [Contributing](../CONTRIBUTING.md) — development workflow

## Reference

- [Configuration reference](configuration.md#reference)
- [Endpoint reference](endpoints.md)
- [Error semantics](operations.md#error-semantics)
- [Changelog](../CHANGELOG.md)
- [Security policy](../SECURITY.md)
