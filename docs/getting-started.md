# Getting Started

This guide takes you from a clean checkout to a running gateway with verified
requests.

## Prerequisites

- Node.js >= 20.11
- npm (ships with Node.js)

## Install

```bash
git clone <repository-url>
cd fastify-gateway
npm install
```

## Configure

Copy the example environment file and set your values:

```bash
cp .env.example .env
```

At minimum, set:

| Variable | Purpose |
| --- | --- |
| `GATEWAY_API_KEY` | Shared secret for API-key-protected services |
| `BASIC_AUTH_USERS` | `username:password` pairs for Basic-auth-protected services |
| `*_SERVICE_URL` | Base URLs of your upstream services |

The full reference lives in [Configuration](configuration.md). The gateway
validates all configuration at boot and refuses to start on invalid values, so
mistakes surface immediately rather than at request time.

## Run

```bash
npm run start:dev      # watch mode — restarts on file changes
```

For other modes:

| Command | Mode |
| --- | --- |
| `npm run start` | Run once from source |
| `npm run start:dev` | Watch mode |
| `npm run start:debug` | Watch mode with the Node.js inspector |
| `npm run build && npm run start:prod` | Compiled production build |
| `docker compose up --build` | Container + demo upstreams ([details](operations.md#docker-compose)) |

## Verify

The gateway serves its own health probes and proxies everything else:

```bash
# Liveness and readiness (no auth, never rate limited)
curl localhost:8080/healthz
curl localhost:8080/readyz

# API-key-protected service
curl -H "x-api-key: <your-key>" localhost:8080/api/users/me

# Basic-auth-protected service
curl -u admin:<password> localhost:8080/api/orders/list

# Public service
curl localhost:8080/api/public/status
```

Every response carries `x-request-id` and `x-correlation-id` headers — see
[Observability](observability.md).

## All scripts

| Script | Purpose |
| --- | --- |
| `npm run start` | Run once from source |
| `npm run start:dev` | Watch mode (`npm run dev` is an alias) |
| `npm run start:debug` | Watch mode with the inspector attached |
| `npm run start:prod` | Run the compiled build from `dist/` |
| `npm run build` | Compile TypeScript and rewrite path aliases |
| `npm run lint` / `lint:check` | ESLint with auto-fix / check only |
| `npm run format` / `format:check` | Prettier write / check only |
| `npm run typecheck` | Type-check without emitting |
| `npm test` | Unit + integration tests |
| `npm run test:watch` | Tests in watch mode |
| `npm run test:cov` | Tests with coverage |
| `npm run test:debug` | Tests with the inspector attached |
| `npm run test:e2e` | Build, then live end-to-end verification |

A `Makefile` and `scripts/tasks.sh` wrap these for convenience — run
`make help` (or `./scripts/tasks.sh` with no argument) to list the targets,
e.g. `make check` for the full local gate or `make up` for the Compose
stack.

## Next steps

- Point the gateway at your own services: [Extending](extending.md)
- Understand the request flow: [Architecture](architecture.md)
- Prepare for production: [Operations](operations.md)
