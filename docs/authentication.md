# Authentication

The gateway authenticates in two directions: **edge** (client → gateway) and
**upstream** (gateway → service). Verifying credentials once at the edge lets
upstreams trust traffic that arrives from the gateway.

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Gateway
    participant Upstream

    Client->>Gateway: GET /api/orders/list<br/>Authorization: Basic (client credentials)
    Gateway->>Gateway: resolve strategy for the service's scheme

    alt credentials missing or invalid
        Gateway-->>Client: 401 Unauthorized<br/>WWW-Authenticate: Basic
    else credentials valid
        Gateway->>Gateway: strip client credentials,<br/>inject upstream credentials
        Gateway->>Upstream: GET /list<br/>Authorization: Basic (gateway credentials)
        Upstream-->>Gateway: 200 OK
        Gateway-->>Client: 200 OK
    end
```

## Edge authentication

Each service declares one scheme:

| Scheme | Credential | Header |
| --- | --- | --- |
| `api-key` | Shared secret (`GATEWAY_API_KEY`) | `x-api-key` |
| `basic` | User list (`BASIC_AUTH_USERS`) | `Authorization: Basic …` |
| `jwt` | HMAC secret or JWKS (`JWT_SECRET` / `JWT_JWKS_URI`) | `Authorization: Bearer …` |
| `bearer` | Introspection against your auth service (`BEARER_INTROSPECTION_URL`) | `Authorization: Bearer …` |
| `none` | — | — |

The `jwt` scheme verifies a signed token's signature and expiry, plus any
configured issuer (`JWT_ISSUER`) and audience (`JWT_AUDIENCE`) claims, using
either a shared HMAC secret (HS256) or a remote JWKS endpoint (RS256/ES256).

The `bearer` scheme validates an opaque token against your own auth service:
it POSTs `{ token }` to `BEARER_INTROSPECTION_URL` and requires an
`{ "active": true }` response (RFC 7662 style). By default the gateway keeps no
token state and introspects on every request, so revocation and refresh are the
auth service's concern. Set `BEARER_INTROSPECTION_TOKEN` if that endpoint itself
requires a credential.

Set `BEARER_CACHE_TTL_MS` to a positive value to cache **active**-token
decisions for that window, so repeated requests with the same token skip the
introspection round-trip — cutting latency and load on the auth service under
real traffic. Only active decisions are cached (keyed by a hash of the token,
never the raw token), so an invalid-token flood cannot grow the cache. The
tradeoff is revocation latency: a revoked token stays accepted until its cached
entry expires, so keep the TTL short.

All credential comparisons are constant-time (`crypto.timingSafeEqual`).
Unknown-username lookups in Basic auth are equalized against a dummy secret,
so timing cannot distinguish existing from non-existing users.

### Failure behavior

| Situation | Response |
| --- | --- |
| Missing or wrong credential | `401` with the uniform error body |
| Failed Basic auth | `401` plus a `WWW-Authenticate: Basic` challenge |
| Expired, unsigned (`alg: none`), or claim-mismatched JWT | `401` |
| Bearer token inactive, or the auth service unreachable / returns a non-2xx or invalid JSON | `401` (fail closed) |
| Scheme enabled but not configured (empty key, user list, or introspection URL) | `500 Gateway misconfigured` — a misconfigured gateway never silently allows traffic |
| Service references a scheme with no registered strategy | Startup failure, not a runtime surprise |

Auth runs as a `preHandler` **before** the proxy, so a rejected request is
never forwarded — the upstream sees nothing on a `401` or `500`.

## Upstream (service-to-service) authentication

A service may declare credentials the gateway presents to its upstream:

```ts
protected upstreamCredentials(config: GatewayConfig) {
  return config.USERS_SERVICE_BASIC_AUTH || undefined;
}
```

When set, the gateway sends them as `Authorization: Basic …` (encoded once at
boot, injected per request), replacing any client-supplied Authorization
value. Upstreams can then require credentials that only the gateway holds.

## Header hygiene

What reaches the upstream, by design:

| Header | Rule |
| --- | --- |
| `x-api-key` | Always stripped — the gateway's edge credential never leaves the edge |
| `Authorization` | Stripped when edge auth consumed it (Basic); replaced when upstream credentials are configured; otherwise **passed through**, so client bearer tokens keep working on `none` and `api-key` services |
| `x-forwarded-for` / `-host` / `-proto` | Appended/set on every proxied request |

A custom scheme that reads `Authorization` should override
`consumesAuthorizationHeader()` — see below.

## Custom schemes

The built-in schemes (`api-key`, `basic`, `jwt`, `bearer`) are themselves
factories in `src/strategies/`; new ones follow the same shape. A strategy is a
factory producing an `AuthStrategy` (a Fastify preHandler), registered in the
strategy registry. For example, an HMAC request-signature scheme:

```ts
// src/strategies/hmac-signature.strategy.ts
import { createHmac, timingSafeEqual } from "node:crypto";
import type { AuthStrategy } from "@/types";
import { sendUnauthorized } from "@/utils";

export function createHmacStrategy(secret: string): AuthStrategy {
  return async (req, reply) => {
    const provided = req.headers["x-signature"];
    const expected = createHmac("sha256", secret).update(req.url).digest("hex");
    if (
      typeof provided !== "string" ||
      provided.length !== expected.length ||
      !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
    ) {
      return sendUnauthorized(req, reply);
    }
  };
}
```

Register it (in `plugins/auth.ts`, or any plugin registered after it):

```ts
fastify.registerAuthStrategy(AuthScheme.Hmac, createHmacStrategy(fastify.config.HMAC_SECRET));
```

Add the scheme value to `src/enums/auth-scheme.enum.ts`, and reference it from
a service. Nothing in the proxy core or the existing strategies changes.
Registering a scheme twice throws, so overrides are always explicit; a service
referencing an unregistered scheme fails at boot with the service name.

If the custom scheme consumes the `Authorization` header, override the
service's `consumesAuthorizationHeader()` so the credential is stripped before
proxying.
