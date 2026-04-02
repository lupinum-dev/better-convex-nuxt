# Development Setup

This file is the maintainer source of truth for local workspace setup and contributor-only app surfaces.

## Repo Surfaces

- repo root: module source, tests, release scripts, anti-drift checks
- `test/internal-harness/`: contributor-only Nuxt app for root dev, evals, E2E, and repro work
- `demo/`: public showcase app
- `docs/`: hosted documentation site
- `examples/`: runnable consumer reference apps

## First-Time Setup

```bash
pnpm install
pnpm dev:prepare
```

`pnpm dev:prepare` builds the module stubs, prepares Nuxt types, and makes the local package surface available to the internal harness and examples.

## Daily Commands

```bash
pnpm dev
pnpm dev:local
pnpm dev:local:reset
pnpm dev:build
pnpm test:types
pnpm test:contracts
pnpm test:internals
pnpm test
pnpm lint
pnpm docs:api-surface
```

- `pnpm dev` runs the internal harness against the default env setup.
- `pnpm dev:local` forces the internal harness onto local Convex ports.
- `pnpm dev:local:reset` does the same and resets the local backend state first.
- `pnpm dev:build` builds the internal harness without starting it.
- `pnpm test:contracts` runs the public contract and maintainer guard suites.
- `pnpm test:internals` runs extracted helper and internal state-machine suites.
- The `vitest/environments` deprecation warning currently comes from the Nuxt/Vitest stack, not a repo-local Trellis import. Recheck on dependency upgrades, especially around `@nuxt/test-utils`.

## Maintenance Rules

This repo is maintained as a long-lived platform. Default rules:

1. Protect the public Nuxt + Convex + Better Auth path first.
2. Prefer `delete > simplify > replace > add`.
3. Do not add new top-level public runtime surfaces unless one replaces an existing surface.
4. Extract pure helpers before adding reactive orchestration.
5. Advanced features must remain isolated from core behavior when disabled.

When touching public APIs, update all of:

- generated API surface
- `docs/content/docs/12.api-reference/0.which-api.md`
- `docs/content/docs/1.guide/7.common-patterns.md`
- the relevant contract tests

When adding a new abstraction, it must do at least one of:

- reduce LOC in a hotspot
- improve direct testability
- remove duplication across multiple call paths

If it does none of those, do not add it.

## Release Discipline

- patch releases prefer bug fixes, simplifications, docs, and tooling hardening
- minor releases that expand surface must also ship examples and tests
- major releases require an explicit migration document
- `trellis doctor` should stay focused on deployment and auth footguns, not style preferences

## Hotspots

Current files that need active pressure to shrink rather than grow:

- `src/runtime/composables/internal/query-runtime.ts`
- `src/runtime/composables/internal/pagination-runtime.ts`
- `src/runtime/composables/internal/upload-runtime.ts`
- `src/runtime/client/auth-engine.ts`
- `src/module.ts`

## Internal Harness

`test/internal-harness/` replaces the old public playground. It is intentionally contributor-facing only.

Use it for:

- feature development against the local module source
- auth and MCP verification
- regression reproduction
- root E2E and eval flows
- backend harness tests under `test/internal-harness/convex`

The root `pnpm dev*` commands all target `test/internal-harness/`.

## Local Env Layout

Prefer `.env.local` and commands with `--dotenv .env.local`.

Important variables:

- Nuxt/module side:
  - `CONVEX_URL`
  - `CONVEX_SITE_URL`
  - `NUXT_PUBLIC_CONVEX_URL`
  - `NUXT_PUBLIC_CONVEX_SITE_URL`
- Auth side:
  - `SITE_URL`
  - `BETTER_AUTH_SECRET`
  - provider credentials such as `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`
- trusted-caller flows:
  - `CONVEX_TRUSTED_CALLER_KEY`
  - `CONVEX_PRIVATE_BRIDGE_KEY` when exercising the private bridge reference lane locally

Relevant docs:

- [Environment Variables](./docs/content/docs/9.configuration/2.environment-variables.md)
- [Local Development](./docs/content/docs/10.deployment/3.local-development.md)

## Local Convex

When you need a dedicated local backend for auth, MCP, or E2E:

```bash
cd test/internal-harness
npx convex dev --local
```

Typical local defaults in this repo:

- `CONVEX_URL=http://127.0.0.1:3210`
- `CONVEX_SITE_URL=http://127.0.0.1:3211`
- `SITE_URL=http://localhost:3000`

If auth setup is missing:

```bash
npx convex env set SITE_URL http://localhost:3000 --env-file .env.local
npx convex env set BETTER_AUTH_SECRET <strong-random-secret> --env-file .env.local
```

## Demo And Docs

- `demo/` is the public interactive showcase. Run it with `pnpm --dir demo dev`.
- `docs/` is the hosted documentation app. Run it with `pnpm --dir docs dev`.

## Related Docs

- [test/TESTING.md](./test/TESTING.md)
- [examples/README.md](./examples/README.md)
- [demo/.env.example](./demo/.env.example)
