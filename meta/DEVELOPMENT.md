# Development Setup

This file is an operational appendix for Trellis-local development.

## Repo Surfaces

- repo root: module source, tests, release scripts, anti-drift checks
- `apps/harness/`: contributor-only Nuxt app for root dev, evals, E2E, and repro work
- `apps/docs/`: hosted documentation site
- `examples/`: runnable consumer reference apps
- `labs/`: exploratory and archived example material

## First-Time Setup

```bash
pnpm install
pnpm run dev:prepare
```

`pnpm install` installs dependencies only. `pnpm run dev:prepare` prepares the Nuxt type projects and the internal harness workspace needed for editor support, linting, and `pnpm test:types`.

`pnpm run dev:prepare` is intentionally narrow. It prepares the internal harness and module type surfaces. It does not rebuild the publishable package or CLI.

## Daily Commands

```bash
pnpm dev
pnpm dev:local
pnpm dev:local:reset
pnpm dev:build
pnpm check:cli
pnpm test:types
pnpm test:contracts
pnpm test:internals
pnpm test
pnpm lint
pnpm release:verify
pnpm docs:api-surface
```

- `pnpm dev` runs the internal harness against the default env setup.
- `pnpm dev:local` forces the internal harness onto local Convex ports.
- `pnpm dev:local:reset` does the same and resets the local backend state first.
- `pnpm dev:build` builds the internal harness without starting it.
- `pnpm check:cli` is the explicit CLI smoke path. CLI maintenance is not coupled to normal harness startup.
- `pnpm test:contracts` runs the public contract and maintainer guard suites.
- `pnpm test:internals` runs extracted helper and internal state-machine suites.
- `pnpm release:verify` runs the maintainer release gate without publishing anything.
- `pnpm release` is an alias for `release:verify`; it does not publish.
- `pnpm release:notes` generates draft changelog text with changelogen.
- `pnpm release:pack` writes inspectable tarballs under `.pack/`.
- With the current dependency set, the `vitest/environments` deprecation warning comes from the Nuxt/Vitest stack, not a repo-local Trellis import. Recheck on dependency upgrades, especially around `@nuxt/test-utils`.

## Hotspots

Current files that need active pressure to shrink rather than grow:

- `src/runtime/convex/query/query-runtime.ts`
- `src/runtime/convex/pagination/pagination-runtime.ts`
- `src/runtime/convex/upload/upload-runtime.ts`
- `src/runtime/auth/client/auth-engine.ts`
- `src/module.ts`

## Internal Harness

`apps/harness/` is the contributor-facing integration workspace behind the root `pnpm dev` loop.

Use it for:

- feature development against the local module source
- auth and MCP verification
- regression reproduction
- root E2E and eval flows
- backend harness tests under `apps/harness/convex`

Use the harness for focused Trellis development. Use downstream consumer workspaces only when validating publish-surface or real integration behavior that the harness cannot prove.

## Local Env Layout

Convex reads `.env.local` directly for local development, so this repo uses one explicit local env file:

- `.env.example`: checked-in example defaults
- `.env.local`: shared local runtime file used by both Convex and Nuxt

The example launcher rewrites launcher-owned local runtime keys in `.env.local` on each run and preserves app-owned values already present in the file.

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
- trusted-forwarding flows:
  - `CONVEX_TRUSTED_FORWARDING_KEY`
  - `CONVEX_PRIVATE_BRIDGE_KEY` when exercising the private bridge reference lane locally

Relevant docs:

- [Environment Variables](./apps/docs/content/docs/10.configuration/2.environment-variables.md)
- [Local Development](./apps/docs/content/docs/11.deployment/3.local-development.md)

## Local Convex

When you need a dedicated local backend for auth, MCP, or E2E:

```bash
cd apps/harness
pnpm exec convex dev --local
```

Typical local defaults in this repo:

- `CONVEX_URL=http://127.0.0.1:3210`
- `CONVEX_SITE_URL=http://127.0.0.1:3211`
- `SITE_URL=http://localhost:3000`

If auth setup is missing:

```bash
pnpm exec convex env set SITE_URL http://localhost:3000 --env-file .env.local
pnpm exec convex env set BETTER_AUTH_SECRET <strong-random-secret> --env-file .env.local
```

## Docs

- `apps/docs/` is the hosted documentation app. Run it with `pnpm --dir apps/docs dev`.

## Related Docs

- [tests/TESTING.md](./tests/TESTING.md)
- [examples/README.md](./examples/README.md)
