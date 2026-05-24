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
- `pnpm run build:client`: devtools UI build only.
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
- `pnpm run release`: alias for `release:verify`; it does not publish.
- `pnpm run release:notes`: generate draft release notes with changelogen.
- `pnpm run release:pack`: build publishable tarballs under `.pack/` for manual inspection.
- `pnpm run harness:convex:codegen`: regenerate Convex code for the internal harness when changing backend schema or functions.
- `pnpm run prepare`: Husky install hook only.

`release:verify` is the authoritative release gate. If that command is not green, the package is not ready to publish. Live publish scripts are disabled; follow `MAINTAINING.md`.

## Public Package Surface

The generated API reference at [`apps/docs/content/docs/13.api-reference/7.api-surface.md`](./apps/docs/content/docs/13.api-reference/7.api-surface.md) is the canonical inventory.

Do not maintain a second handwritten export list here. If a change touches exports, update the generated API surface page in the same PR.

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
# PR-safe default gate
pnpm run test:types
pnpm run lint
pnpm run test:contracts

# Run the strict release-style test gate (adds e2e)
pnpm run test:full
```

Use the PR-safe gate before pushing. Reserve `test:full` for release work or when you need the managed e2e path.

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
    auth/                # defineAppIdentity, defineGuard, defineAccessContext
    functions/           # defineTrellis, handler pipeline
    composables/         # useConvexQuery, useMutation, useAuth, etc.
    mcp/                 # defineMcpApp, tool, MCP helpers
    visibility/          # defineRecordAccess, defineRedaction
    server/              # Nitro server utilities
    testing/             # Test context and helpers
    identity-forwarding/ # Server-to-server auth

examples/                # Progressive public examples
tests/                   # Root test suites, fixtures, and support
apps/                    # Runnable maintainer apps
labs/                    # Experimental or archived examples
```

## Pull Request Guidelines

1. Create a feature branch from `main`.
2. Keep PRs focused — one feature or fix per PR.
3. Add or update tests for any changed behavior.
4. Run `pnpm run test:types && pnpm run lint && pnpm run test:contracts` before pushing.
5. Write a clear description of what changed and why.

## Code Style

The project uses ESLint with the Nuxt preset. Run `pnpm run lint` to check. Key conventions:

- No floating promises (always `await` or return them).
- No `useConvexQuery` in middleware or plugins (scope violation).
- Handlers must declare a `guard` — omitting it is a type error.
- Public docs and examples must not regress on identity-forwarding, protocol, or middleware-boundary rules enforced by the root grep checks.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
