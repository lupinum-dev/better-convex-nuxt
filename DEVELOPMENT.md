# Development Setup

This file is the maintainer source of truth for local workspace setup.

## Workspaces

- repo root: module source, tests, release scripts
- `playground/`: Nuxt app wired directly to the local module for dev/debugging
- `demo/`: polished example app and deployment reference
- `docs/`: hosted documentation site

## First-Time Setup

```bash
pnpm install
pnpm dev:prepare
```

`pnpm dev:prepare` builds the module stubs and prepares the playground against the local source.

## Local Env Layout

For local Nuxt work, prefer `.env.local` and run commands with `--dotenv .env.local`.

Important variables:

- Nuxt/module side:
  - `CONVEX_URL`
  - optionally `CONVEX_SITE_URL`
- Convex auth side:
  - `SITE_URL`
  - `BETTER_AUTH_SECRET`
  - provider credentials like `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`

See the public [deployment environment matrix](./docs/content/docs/8.deployment/2.environment-matrix.md) for the canonical ownership table.

## Convex Local Dev

When working on auth flows or the playground:

```bash
cd playground
npx convex dev --local
```

The local Convex defaults used in this repo are typically:

- `CONVEX_URL=http://127.0.0.1:3210`
- `CONVEX_SITE_URL=http://127.0.0.1:3211`

If you need local Convex env vars for auth:

```bash
npx convex env set SITE_URL http://localhost:3000 --env-file .env.local
npx convex env set BETTER_AUTH_SECRET <strong-random-secret> --env-file .env.local
```

## Common Commands

```bash
pnpm dev
pnpm test
pnpm lint
pnpm docs:api-surface
```

## Playground vs Demo

- Use `playground/` for feature work, regression reproduction, and devtools/debugging.
- Use `demo/` for curated example flows and deployment-oriented docs/examples.

## Related Docs

- [test/TESTING.md](./test/TESTING.md)
- [demo/.env.example](./demo/.env.example)
- [docs/content/docs/8.deployment/2.environment-matrix.md](./docs/content/docs/8.deployment/2.environment-matrix.md)
