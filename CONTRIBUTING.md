# Contributing

Thanks for your interest in @lupinum/trellis! This guide covers the development setup, testing, and contribution workflow.

## Prerequisites

- Node.js 18+
- pnpm 9+

## Development Setup

```bash
# Install dependencies
pnpm install

# Prepare the module (stub build + codegen)
pnpm run dev:prepare

# Start the internal test harness with Nuxt dev server
pnpm run dev
```

## Running Tests

```bash
# Run the full test suite (unit + convex + nuxt + server + browser)
pnpm run test

# Run a specific test file
pnpm run test -- path/to/test.ts
```

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
pnpm run prepack
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
    functions/           # createApp, handler pipeline
    composables/         # useConvexQuery, useMutation, useAuth, etc.
    mcp/                 # MCP tool definitions
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

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
