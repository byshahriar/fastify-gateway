# AGENTS.md

Instructions for AI coding agents (Claude Code, Codex, Cursor, GitHub Copilot,
Gemini CLI, and others) working in this repository. Humans should read
[CONTRIBUTING.md](CONTRIBUTING.md) instead — this file is optimized for
machine context, not onboarding prose.

## What this project is

`fastify-gateway` is a lightweight, extensible edge API gateway built on
Fastify: it authenticates requests, proxies them to upstream services with
fail-fast timeouts and connection pooling, and propagates distributed-tracing
context on every hop. Full architecture: [docs/architecture.md](docs/architecture.md).

## Tech stack

- Node.js >= 20.11, TypeScript (`strict: true`, `erasableSyntaxOnly: true` —
  no runtime-emitting type syntax; see [Conventions](#conventions) below)
- Fastify 5, `fastify-plugin` for cross-cutting concerns, `@fastify/*`
  ecosystem plugins (helmet, cors, env, rate-limit, redis, under-pressure,
  http-proxy)
- `ioredis` (optional, feature-flagged), `jose` for JWT, `pino`/`pino-roll`
  for logging, `prom-client` for metrics, `p-retry` for alert delivery
- Vitest for unit/integration tests, a stdlib-only script for end-to-end
- ESLint (flat config, `typescript-eslint`) + Prettier; Husky + lint-staged
  on pre-commit

## Commands

Run from the repo root:

| Command | Purpose |
| --- | --- |
| `npm run start:dev` | Watch mode — the usual dev loop |
| `npm run build` | Compile TypeScript, rewrite `@/` aliases to relative paths |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint:check` / `npm run lint` | ESLint check / auto-fix |
| `npm run format:check` / `npm run format` | Prettier check / write |
| `npm test` | Unit + integration tests (Vitest) |
| `npm run test:cov` | Tests with V8 coverage |
| `npm run test:e2e` | Builds, then runs `scripts/e2e.mjs` against the compiled binary as a real process |

**Before considering any change done**, run in this order: `typecheck` →
`lint:check` → `format:check` (or `format`) → `test` → `build` →
`test:e2e`. All must pass. `test:e2e` is the strongest signal — it proves
the change works over real HTTP against the compiled artifact, not just
against the type checker.

## Conventions

The canonical, detailed version of these lives in
[docs/extending.md → Conventions to keep](docs/extending.md#conventions-to-keep).
Summary:

- **Imports** — always `@/` aliases via folder barrels (`import { Header }
  from "@/constants"`); no relative `../../` chains, no file extensions.
- **File naming** — `*.constants.ts`, `*.enum.ts`, `*.interface.ts`,
  `*.type.ts`, `*.util.ts`, `*.strategy.ts`, `*.gateway.ts`.
- **No raw literals** — header names from `Header` (`@/constants`), statuses
  from `HttpStatus`, client-facing messages from `ErrorMessage`, schemes
  from `AuthScheme`. If you're about to write a literal that duplicates an
  existing constant/enum value, use the constant instead; if the constant
  doesn't exist yet and the value is gateway-specific (not external-spec
  vocabulary like HTTP methods), add it.
- **Configuration** — every runtime value goes through
  `src/config/schema.ts`; never read `process.env` outside the factory
  options in `app.ts` / the schema itself.
- **`as const` objects, not TypeScript `enum`** — the project enforces
  `erasableSyntaxOnly`. Follow the existing pattern in `src/enums/*.enum.ts`
  (a `const` object plus a derived union type sharing the same name).
- **Comments** — JSDoc on exported declarations and members; `//` for
  internal notes. Nothing that repeats the code, and nothing that narrates
  change history ("added for X", "previously did Y", "now supports Z") —
  that belongs in the commit message and PR description, not the code. A
  module- or class-level doc comment is a short prose intro, and only when
  there's more than one distinct fact worth stating, a flat bulleted list of
  complete, capitalized, period-terminated sentences — never a second prose
  paragraph, nested bullets, or an ad hoc sub-heading. A function- or
  method-level doc comment is prose plus `@param`/`@returns`/`@throws`; the
  tags already provide structure, so it doesn't also need bullets.
- **Tests assert the wire contract with literals** — test files deliberately
  do not import `Header`/`HttpStatus`/`ErrorMessage`; `expect(res.statusCode).toBe(401)`
  is correct, importing the constant into the test is not (it would let a
  wrong constant pass against itself). Config-value enums
  (`AuthScheme`, `AlertLevel`, etc.) are the opposite — tests **should**
  import and use those when exercising a real, valid selection, and only
  fall back to a raw string for a deliberately-invalid negative-test value.
- **Every property in an interface/type either all have doc comments or
  none do** — no partial coverage within one declaration. If most sibling
  properties already have comments, add one to the rest rather than leaving
  a gap.
- **Tests accompany behavior** — see [docs/testing.md](docs/testing.md).

## Boundaries

- Never commit `.env` or secrets; `.env.example` is the template.
- Never bypass the auth strategy registry (`fastify.registerAuthStrategy`)
  to add a scheme — see [docs/extending.md](docs/extending.md).
- Never skip pre-commit hooks (`--no-verify`) or bypass signing.
- Prefer many small, single-purpose commits over one large one; never use
  `git commit --amend` or force-push unless explicitly asked to. Do not add
  co-author lines or trailers to commits unless asked.
- Ask before destructive git operations (`reset --hard`, force-push,
  branch deletion) and before pushing to a remote at all.
- Match existing patterns before introducing a new one — read a sibling
  file in the same folder before writing a new plugin/strategy/gateway
  class; this codebase's folders (`plugins/`, `strategies/`, `gateways/`)
  are intentionally uniform in shape.

## Where to look

| Question | Read |
| --- | --- |
| How is the app composed / what's the request lifecycle? | [docs/architecture.md](docs/architecture.md) |
| What does each environment variable do? | [docs/configuration.md](docs/configuration.md) |
| How does edge / upstream auth work? | [docs/authentication.md](docs/authentication.md) |
| How do I add a service or auth scheme? | [docs/extending.md](docs/extending.md) |
| How are tests structured, and how do I write one? | [docs/testing.md](docs/testing.md) |
| What are the error/status semantics? | [docs/operations.md](docs/operations.md#error-semantics) |
| Trust boundaries and security guarantees? | [docs/security-model.md](docs/security-model.md) |
