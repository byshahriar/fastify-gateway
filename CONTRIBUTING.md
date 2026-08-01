# Contributing

Thank you for considering a contribution. This document covers the workflow;
project internals are documented in [docs/](docs/architecture.md).

## Development setup

```bash
git clone <your-fork>
cd fastify-gateway
npm install
cp .env.example .env
npm run start:dev
```

Requires Node.js >= 20.11. All scripts are listed in
[Getting Started](docs/getting-started.md#all-scripts).

## Workflow

1. Fork and create a topic branch from `main`.
2. Make your change, with tests — see [Testing](docs/testing.md#writing-tests).
3. Run the quality gates locally:

   ```bash
   npm run lint:check && npm run typecheck && npm test
   ```

4. Open a pull request. CI runs lint, typecheck, the test suite, and the
   end-to-end suite on Node.js 20 and 22; all must pass.

## What makes a good pull request

- **Focused** — one change per PR; unrelated refactors make review harder.
- **Explained** — describe the behavior change and the reasoning, not just
  the diff.
- **Tested** — success path, failure path, and boundary cases for new
  behavior.
- **Consistent** — follows the conventions in
  [Extending → Conventions](docs/extending.md#conventions-to-keep): `@/`
  alias imports, constants over raw literals, configuration through the
  schema, JSDoc on exported declarations.

## Reporting bugs and proposing features

Use the issue templates. For bugs, include reproduction steps, expected vs
actual behavior, and your Node.js version. For features, describe the problem
before the solution — design discussions are welcome in the issue before any
code is written.

## Security issues

Never open a public issue for a suspected vulnerability — follow
[SECURITY.md](SECURITY.md).

## Code of conduct

Participation in this project is governed by the
[Code of Conduct](CODE_OF_CONDUCT.md).
