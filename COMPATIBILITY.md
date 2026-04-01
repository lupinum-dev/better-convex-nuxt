# Compatibility

This document tracks the current dependency line used by the package and the consumer-owned ranges that are intentionally supported.

## Current Package Line

The repository is currently on `0.3.x` and `package.json` is at `0.3.4`.

| Dependency                | Used By Package   | Consumer-Owned Range / Notes          |
| ------------------------- | ----------------- | ------------------------------------- |
| `convex`                  | `^1.34.0`         | optional peer at `^1.32.0`            |
| `better-auth`             | `>=1.5.0 <1.6.0`  | internal package dependency           |
| `@convex-dev/better-auth` | `^0.11.3`         | internal package dependency           |
| `@nuxtjs/mcp-toolkit`     | dev + optional peer | required only for MCP features      |
| `convex-helpers`          | dev + optional peer | required only for shared-schema MCP |
| `zod`                     | dev + optional peer | required only for shared-schema MCP |
| Nuxt                      | not bundled       | expected in the consumer app          |

## Consumer Expectations

- Most apps install `convex` directly for backend codegen and server files. The package keeps it as an optional peer so package managers can warn on incompatible versions.
- `better-auth` and `@convex-dev/better-auth` are internal to the module package surface. Consumers do not need to dedupe them unless their own app also uses those libraries directly.
- MCP-only flows need the optional peers: `@nuxtjs/mcp-toolkit`, `convex-helpers`, and `zod`.

## Upgrade Policy

- `convex`, `better-auth`, and `@convex-dev/better-auth` are treated as one compatibility set.
- We prefer bumping that set deliberately in one release instead of drifting them independently.
- The `better-auth` upper bound follows the compatibility window exposed by `@convex-dev/better-auth`.

## CI Verification

Compatibility is guarded by the root test suite and three consumer-smoke fixtures:

- `consumer-smoke`: bare module consumer
- `consumer-smoke-auth`: auth-enabled consumer
- `consumer-smoke-own-convex`: consumer that brings its own `convex` dependency
