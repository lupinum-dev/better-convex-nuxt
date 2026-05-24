# Public Surface

Use this when deciding where a Trellis symbol comes from. Do not guess. Trellis
has three different surfaces that look similar but are not interchangeable:
published npm subpaths, Nuxt auto-imports, and generated Nuxt aliases.

## Verify First

- Package exports: `package.json` `exports` and `typesVersions`.
- Nuxt auto-imports and aliases: `src/installers/core.ts`,
  `src/installers/advanced.ts`, `src/installers/auth.ts`,
  `src/installers/permissions.ts`.
- Generated API docs: `apps/docs/content/docs/13.api-reference/7.api-surface.md`.
- Public-surface tests: `tests/unit/api-surface-doc.test.ts`,
  `tests/unit/runtime-facade-boundaries.test.ts`,
  `scripts/generate-api-surface.mjs`.

## Published Package Subpaths

Current package exports are:

- `@lupinum/trellis`
- `@lupinum/trellis/args`
- `@lupinum/trellis/auth`
- `@lupinum/trellis/backend`
- `@lupinum/trellis/composables`
- `@lupinum/trellis/mcp`
- `@lupinum/trellis/server`
- `@lupinum/trellis/testing`
- `@lupinum/trellis/type-primitives`
- `@lupinum/trellis/workspace`

If a proposed import is not in `package.json`, treat it as unavailable until the
public surface is deliberately changed and tested.

Package-author bridge APIs are owned by the separate `@lupinum/trellis-bridge`
package. They are not re-exported from the core Trellis package.

Known rejected legacy/nonexistent subpaths include:

- `@lupinum/trellis/actor`
- `@lupinum/trellis/bridge`
- `@lupinum/trellis/convex`
- `@lupinum/trellis/eslint`
- `@lupinum/trellis/feature`
- `@lupinum/trellis/functions`
- `@lupinum/trellis/schema`
- `@lupinum/trellis/scoping`
- `@lupinum/trellis/service`
- `@lupinum/trellis/trusted-forwarding`
- `@lupinum/trellis/visibility`

Verify this list in `tests/unit/package-subpath-exports.test.ts` before
mentioning it in user-facing docs.

## Generated Nuxt Aliases

Inside a Nuxt app with the module installed:

- `#trellis` re-exports the runtime composables barrel.
- `#trellis/api` points to the app-local `convex/_generated/api`.
- `#trellis/server` re-exports the server runtime barrel.
- `#trellis/mcp` re-exports the MCP runtime barrel.

These are Nuxt aliases, not npm package specifiers. Use them in app code where
Nuxt resolves aliases. Use package subpaths in library/backend contexts that
cannot rely on a consumer Nuxt alias.

## Client Auto-Imports

Core client auto-imports are registered by `installCoreTrellis`:

- `useConvex`
- `useConvexQuery`
- `executeConvexQuery`
- `useConvexPaginatedQuery`
- `useCachedQuery`
- `useConvexMutation`
- `useConvexAction`
- `useConvexConnectionState`
- `useConvexUpload`
- `useConvexStorageUrl`
- `prependTo`
- `appendTo`
- `removeFrom`
- `updateIn`

Auth auto-imports are registered only when `trellis.auth` is enabled:

- `useConvexAuth`
- `useBetterAuthActions`
- `useBetterAuthSignIn`
- `useBetterAuthSignUp`
- `useBetterAuthPasswordReset`

Permission auto-imports are registered only when
`trellis.permissions.query` resolves:

- `usePermissions`
- `useAuthGuard`

Do not document `usePermissions()` or `useAuthGuard()` as package exports. They
are config-driven generated imports.

## Server Auto-Imports

Nuxt server files get:

- `serverConvexQuery`
- `serverConvexMutation`
- `serverConvexAction`
- `serverConvexClearAuthCache`
- `validateConvexArgs`

Only the three `serverConvex*` helpers are also exported from
`@lupinum/trellis/server`. `serverConvexClearAuthCache` and
`validateConvexArgs` are Nuxt server auto-imports only.

## Global Auth Components

Registered only when `trellis.auth` is enabled:

- `<ConvexAuthenticated>`
- `<ConvexUnauthenticated>`
- `<ConvexAuthLoading>`
- `<ConvexAuthError>`

## Boundary Rules

- Do not mix package exports and Nuxt aliases in examples without explaining the
  runtime context.
- Do not add a package export just because an alias exists. Public exports are a
  deliberate surface.
- Do not reintroduce older rejected subpaths as compatibility aliases unless the
  user explicitly asks for a compatibility layer.
- Do not rely on generated `dist` as the first source of truth; verify source
  and tests first.
- When updating docs, run `pnpm run check:docs:api-surface` if any export,
  auto-import, alias, or component surface changed.
