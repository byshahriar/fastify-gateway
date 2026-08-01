# Deployment

The gateway is a single stateless process (aside from the in-memory rate
limiter). This guide covers Docker, Compose, and Kubernetes. For the
production concerns behind these — shutdown, timeouts, trust — see
[Operations](operations.md).

## Docker

```bash
docker build -t fastify-gateway .
docker run --rm -p 8080:8080 --env-file .env fastify-gateway
```

The image is multi-stage on a digest-pinned base, ships only production
dependencies and the compiled `dist/`, runs as the non-root `node` user, and
declares a container healthcheck against `/healthz`.

## Docker Compose

`compose.yaml` runs the gateway plus three demo upstreams wired through
Compose DNS:

```bash
docker compose up --build
```

Override credentials from the shell (`GATEWAY_API_KEY=… docker compose up`),
and replace the demo upstreams with your real services. The topology sets
`TRUST_PROXY=false` because clients reach the published port directly.

## Kubernetes

A minimal, production-shaped manifest. Store secrets in a `Secret`, not in the
`Deployment`.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: fastify-gateway
spec:
  replicas: 3
  selector:
    matchLabels: { app: fastify-gateway }
  template:
    metadata:
      labels: { app: fastify-gateway }
    spec:
      containers:
        - name: gateway
          image: your-registry/fastify-gateway:1.0.0
          ports:
            - containerPort: 8080
          env:
            - name: USERS_SERVICE_URL
              value: http://users.default.svc.cluster.local
            - name: GATEWAY_API_KEY
              valueFrom:
                secretKeyRef: { name: gateway-secrets, key: api-key }
            - name: BASIC_AUTH_USERS
              valueFrom:
                secretKeyRef: { name: gateway-secrets, key: basic-users }
            - name: METRICS_TOKEN
              valueFrom:
                secretKeyRef: { name: gateway-secrets, key: metrics-token }
          livenessProbe:
            httpGet: { path: /healthz, port: 8080 }
            periodSeconds: 10
          readinessProbe:
            httpGet: { path: /readyz, port: 8080 }
            periodSeconds: 5
          resources:
            requests: { cpu: 100m, memory: 128Mi }
            limits: { memory: 256Mi }
---
apiVersion: v1
kind: Service
metadata:
  name: fastify-gateway
spec:
  selector: { app: fastify-gateway }
  ports:
    - port: 80
      targetPort: 8080
```

Key points:

- **Probes** map to the built-in endpoints: `livenessProbe` → `/healthz`,
  `readinessProbe` → `/readyz`. On shutdown the gateway flips `/readyz` to
  `503`, so Kubernetes stops routing to a draining pod before the listener
  closes.
- **Graceful shutdown** is bounded by `SHUTDOWN_TIMEOUT_MS`; keep it below the
  pod's `terminationGracePeriodSeconds` (default 30s) so the drain completes
  before Kubernetes sends `SIGKILL`.
- **Trust** — behind an ingress or service mesh, keep `TRUST_PROXY=true`.
  Ensure the ingress sets `x-forwarded-for` correctly.
- **Rate limiting across replicas** — the in-memory limiter is per-pod. With
  `replicas: 3`, effective limits are 3× per client until you switch to the
  Redis store in `src/plugins/rate-limit.ts`.
- **Metrics scraping** — expose `/metrics` to Prometheus with a
  `METRICS_TOKEN`; keep it off any public ingress route.

## Configuration in containers

All configuration is environment variables — see
[Configuration](configuration.md). Provide secrets through your platform's
secret store; never bake them into an image. The full list of what must be set
per environment is in
[Getting Started → Configure](getting-started.md#configure).

## Health check summary

| Concern | Endpoint | Behavior |
| --- | --- | --- |
| Liveness | `/healthz` | `200` while the process runs |
| Readiness | `/readyz` | `200` ready, `503` draining during shutdown |
