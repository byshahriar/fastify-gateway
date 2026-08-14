# GitHub Copilot instructions

The full, canonical rules for AI coding agents in this repository live in
[AGENTS.md](../AGENTS.md) at the repo root — read it before making changes.
It covers the tech stack, required commands (`typecheck`, `lint:check`,
`test`, `build`, `test:e2e` — all must pass before a change is done),
conventions (`@/` alias imports, no raw literals where a constant/enum
exists, `as const` objects instead of TypeScript `enum`, the doc-comment
structure rules), and boundaries (never read `process.env` outside the
config schema, plugin registration order in `src/app.ts` is load-bearing,
prefer small split commits with no co-author trailers).

This file exists only because GitHub Copilot looks for it specifically;
`AGENTS.md` is the single source of truth — do not duplicate its content
here as it changes.
