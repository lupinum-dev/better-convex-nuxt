# Contributing

Thanks for your interest in @lupinum/trellis! This guide covers the development setup, testing, and contribution workflow.

## Prerequisites

- Node.js 18+
- pnpm 9+

## Development Setup

```bash
# Install dependencies
pnpm install

# Prepare Nuxt types and the internal harness workspace
pnpm run dev:prepare

# Start the internal test harness with Nuxt dev server
pnpm run dev
```

## Command Map

Treat the root script surface as four tiers.

### Daily maintainer loop

```bash
pnpm run dev
pnpm run lint
pnpm run test
pnpm run build
pnpm run check
```

- `dev`: starts the internal harness, which is the canonical maintainer app for runtime work.
- `lint`: code lint plus repo policy and docs drift guards.
- `test`: repo tests plus curated example tests.
- `build`: canonical full build for the published module, client, and CLI.
- `check`: umbrella repo-quality gate for formatting, lint, publish surface, types, contracts, and CLI boot.

### Focused commands

- `pnpm run dev:prepare`: prepare Nuxt types and the internal harness workspace without starting the dev server.
- `pnpm run dev:local`: run the harness against local Convex ports.
- `pnpm run dev:local:reset`: same as `dev:local`, but reset the local backend first.
- `pnpm run dev:build`: build only the internal harness app.
- `pnpm run build:module`: package/runtime build only.
- `pnpm run build:client`: docs/devtools client build only.
- `pnpm run build:cli`: CLI build only.
- `pnpm run test:types`: type-only gate.
- `pnpm run test:contracts`: public behavior and example contract coverage.
- `pnpm run test:internals`: extracted internal state/runtime helpers.
- `pnpm run test:e2e`: managed end-to-end smoke coverage.
- `pnpm run check:publish-surface`: package export and declaration-surface validation.
- `pnpm run check:cli`: verify the built CLI entrypoint resolves and boots.
- `pnpm run format:check`: formatting gate.
- `pnpm run format`: rewrite formatting locally.

### Docs and API maintenance

- `pnpm run docs:api-surface`: regenerate the package/API surface doc from repo sources.
- `pnpm run check:docs:api-surface`: verify the generated API surface doc is current.
- `pnpm run check:docs:links`: verify internal docs links and public-doc policy guards.

### Release and niche maintainer commands

- `pnpm run release:verify`: stricter release gate than day-to-day `check`; includes the full suite and build.
- `pnpm run release`: publish workflow.
- `pnpm run harness:convex:codegen`: regenerate Convex code for the internal harness when changing backend schema or functions.
- `pnpm run prepare`: Husky install hook only.

## Public Package Surface

The generated API reference at [`docs/content/docs/13.api-reference/7.api-surface.md`](./docs/content/docs/13.api-reference/7.api-surface.md) is the canonical inventory. The maintained npm subpaths are:

- `@lupinum/trellis`: Nuxt module entry and root runtime surface
- `@lupinum/trellis/auth`: Convex auth, guards, permissions, and auth config primitives
- `@lupinum/trellis/args`: shared argument-schema helpers
- `@lupinum/trellis/composables`: client composables for queries, mutations, uploads, and auth
- `@lupinum/trellis/functions`: backend authoring primitives such as `defineTrellis(...)` and operations
- `@lupinum/trellis/mcp`: MCP app and tool primitives
- `@lupinum/trellis/server`: server-side Convex caller and Nitro helpers
- `@lupinum/trellis/testing`: supported public testing helpers
- `@lupinum/trellis/trusted-caller`: trusted-caller primitives
- `@lupinum/trellis/visibility`: per-record capability/redaction helpers
- `@lupinum/trellis/eslint`: ESLint integration

If a change touches exports, keep the package surface and the generated API surface page aligned in the same PR.

## Publish-Surface Invariants

`pnpm run check:publish-surface` is the maintainer check for published package correctness. It protects one narrow contract:

- every declared `exports` entry resolves
- the mirrored type routing still matches the kept subpaths
- built declaration files do not contain invalid rewritten specifiers

Related build scripts are intentionally separate because they fail for different reasons:

- `scripts/fix-dts-specifiers.mjs`: temporary repair pass for broken declaration specifiers emitted by the module build
- `scripts/check-dist-dts-specifiers.mjs`: asserts the repair actually succeeded
- `scripts/check-publish-specifiers.mjs`: verifies the published subpath/specifier contract itself

Keep those scripts only while the build still needs them. They are part of the publish contract, not generic tooling.

## Running Tests

```bash
# Run the default maintainer test gate (repo + examples)
pnpm run test

# Run the strict release-style test gate (adds e2e)
pnpm run test:full
```

For targeted work, use the focused lanes above instead of adding more top-level aliases.

## Linting

```bash
# Run all lint checks (ESLint + custom guards)
pnpm run lint

# Check formatting only
pnpm run format:check
```

## Building

```bash
# Full production build (module + client + CLI)
pnpm run build
```

## Running Examples

Each example in `examples/` is a standalone Nuxt app:

```bash
cd examples/01-public-todo
pnpm install
pnpm dev
```

See [examples/README.md](./examples/README.md) for the full list and what each one demonstrates.

## Project Structure

```
src/
  module.ts              # Nuxt module entry point
  runtime/
    auth/                # defineActor, defineGuard, definePermissionContext
    functions/           # defineTrellis, handler pipeline
    composables/         # useConvexQuery, useMutation, useAuth, etc.
    mcp/                 # defineMcpApp, tool, MCP helpers
    visibility/          # defineCapabilities, defineRedaction
    server/              # Nitro server utilities
    testing/             # Test context and helpers
    trusted-caller/      # Server-to-server auth

examples/                # Progressive examples (01-07)
test/                    # Test suites
docs/                    # Documentation site
```

## Pull Request Guidelines

1. Create a feature branch from `main`.
2. Keep PRs focused — one feature or fix per PR.
3. Add or update tests for any changed behavior.
4. Run `pnpm run lint && pnpm run test` before pushing.
5. Write a clear description of what changed and why.

## Code Style

The project uses ESLint with the Nuxt preset. Run `pnpm run lint` to check. Key conventions:

- No floating promises (always `await` or return them).
- No `useConvexQuery` in middleware or plugins (scope violation).
- Handlers must declare a `guard` — omitting it is a type error.
- Public docs and examples must not regress on trusted-caller, protocol, or middleware-boundary rules enforced by the root grep checks.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
