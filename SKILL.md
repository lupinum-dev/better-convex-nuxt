---
name: trellis
description: >
  Use this skill when working with Trellis, its package subpaths,
  Nuxt auto-imports, or its auth, permissions, server, testing, or MCP patterns.
  Activate whenever a Nuxt project uses @lupinum/trellis or APIs such as
  useConvexQuery, useConvexMutation, useConvexAction, useConvexPaginatedQuery,
  useCachedQuery, useConvexAuth, useConvexAuthActions, useConvexUpload,
  useConvexStorageUrl, useConvexConnectionState, usePermissions, useAuthGuard,
  serverConvexQuery, serverConvexMutation, serverConvexAction, defineArgs,
  defineTool, withTrustedCaller, getTrustedCaller, enforce, or the
  #trellis/mcp and #trellis/server aliases.
---

# Trellis

Nuxt module for Convex with SSR queries, realtime subscriptions, Better Auth integration, app-owned permissions, server helpers, uploads, testing helpers, and MCP tooling.

Docs: https://trellis.vercel.app

## Public Surface

Published package imports:

- `@lupinum/trellis`
- `@lupinum/trellis/auth`
- `@lupinum/trellis/args`
- `@lupinum/trellis/composables`
- `@lupinum/trellis/mcp`
- `@lupinum/trellis/server`
- `@lupinum/trellis/testing`
- `@lupinum/trellis/trusted-caller`
- `@lupinum/trellis/visibility`

Nuxt-generated surfaces:

- `#trellis/mcp`
- `#trellis/server`
- server auto-imports from `#imports`
- config-driven auto-imports like `usePermissions()` and `useAuthGuard()`

Do not confuse package exports with Nuxt auto-imports or generated aliases.

## Current Patterns

### Queries

- Use `await useConvexQuery(...)` for SSR + subscriptions.
- Use `useConvexPaginatedQuery(...)` for paginated lists.
- Use `useCachedQuery(...)` when a detail query can seed itself from already-fetched list data.
- Use `executeConvexQuery(...)` only as the Nuxt auto-import for one-shot query execution.
- Conditional queries use the null-args pattern, not conditional composable calls.

### Mutations And Actions

- `useConvexMutation(...)` returns a callable function with reactive state properties.
- `useConvexAction(...)` has the same shape, without optimistic updates.
- Optimistic helpers are `prependTo`, `appendTo`, `removeFrom`, and `updateIn`.

### Auth

- `useConvexAuth()` exposes auth state and the Better Auth client.
- `useConvexAuthActions()` wraps Better Auth client calls and refreshes Convex auth afterward.
- Auth components are global only when `trellis.auth` is enabled:
  - `<ConvexAuthenticated>`
  - `<ConvexUnauthenticated>`
  - `<ConvexAuthLoading>`
  - `<ConvexAuthError>`

### Permissions

- The app owns the permission-context query.
- The module wires frontend reflection through `trellis.permissions.query`.
- `usePermissions()` and `useAuthGuard()` are generated auto-imports, not package exports.
- Prefer backend-owned `_can` data for resource-specific authorization. Use `useAuthGuard()` for page-level capability gating.

### Shared Args

- Define shared input schemas with `defineArgs()` from `@lupinum/trellis/args`.
- Reuse the same schema across Convex handlers, Nitro routes, and MCP tools.
- Shared args are schema-only. Hidden trusted-caller transport belongs in `withTrustedCaller(...)`, not in `defineArgs()`.

### Trusted Caller

- Use `withTrustedCaller(schema.args)` in Convex validators that support server-to-server or MCP actor injection.
- Resolve the effective actor explicitly with `getActor(ctx)` in app code.
- Use `getTrustedCaller()` inside trusted-caller-aware Convex handlers once the context wrapper is in place.
- Old wrapper-style actor APIs are not part of the current foundation.

### Server Helpers

- Package export: `@lupinum/trellis/server`
  - `serverConvexQuery`
  - `serverConvexMutation`
  - `serverConvexAction`
- Nuxt server auto-import only:
  - `serverConvexClearAuthCache`
  - `validateConvexArgs`
- `ServerConvexOptions.auth` supports `'auto'`, `'required'`, `'none'`, and `'trusted'`.

### MCP

- Use `defineTool()` from `#trellis/mcp` for Convex-backed MCP tools.
- Use generic MCP primitives from the same alias when you need prompts, resources, handlers, sessions, or dynamic tools.
- `scoped: true` is the trusted-caller-aware MCP path. It still requires explicit actor resolution in the Convex handler.

### Testing

- Use `convexTestConfig()` and `createTestContext()` from `@lupinum/trellis/testing`.
- Keep `convex/test.setup.ts` in the consumer app.
- `asTrustedCaller()` is the test-only way to exercise trusted-caller paths.

## Current Repo Surfaces

- `src/`: package source
- `docs/`: hosted docs app and docs content
- `demo/`: public showcase app
- `test/internal-harness/`: contributor-only dev and test harness
- `examples/`: runnable consumer reference apps

## Source Of Truth

Prefer these docs when answering questions:

- `docs/content/docs/12.api-reference/7.api-surface.md`
- `docs/content/docs/12.api-reference/1.composables.md`
- `docs/content/docs/12.api-reference/3.server-utilities.md`
- `docs/content/docs/12.api-reference/5.mcp.md`
- `docs/content/docs/7.permissions/*.md`
- `docs/content/docs/13.mcp-tools/*.md`

When in doubt, verify against:

- `package.json` exports
- `src/module.ts` auto-import and alias registration
- `src/runtime/composables/index.ts`
- `src/runtime/server/index.ts`
- `src/runtime/mcp/index.ts`
