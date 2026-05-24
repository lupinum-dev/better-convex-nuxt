# Changelog

## Unreleased

### Future 1.0 Hardening Notes

Trellis 1.0 hardens the production boundary and intentionally removes soft fallback paths.

### ⚠️ Breaking / Security Notes

- Permission metadata generation is opt-in. Keep `permissions: 'path.to.query'` for composables only, or use `permissions: { query: 'path.to.query', codegen: true }` when you need generated permission metadata.
- Component bridge trusted forwarding now requires a component-side `CONVEX_TRUSTED_FORWARDING_KEY` or explicit bridge key option. Signing secrets are not transported in Convex args.
- MCP write, scoped, destructive, and code-mode routes require bearer authentication. Anonymous MCP is reserved for deliberately public read-only tools.

### Release Maintenance

These notes document the 0.4.0 release-preparation hardening. No package version
has been bumped after `v0.4.0`; if another package change lands, add a new
version section instead of publishing these notes as a patch release.

### 🚀 Enhancements

- `trellis init` and `trellis add` now support `--json`, returning a stable machine-readable
  summary with `status`, `command`, `label`, `cwd`, `description`, and file lists for
  `authored`, `generated`, `written`, and `skipped`.
- Release preparation now uses changelogen for changelog generation, but live npm
  publishing is intentionally manual and documented in `MAINTAINING.md`.

### 🩹 Fixes

- Restored the release gate by fixing the formatting drift in `eslint.config.mjs`.
- Fixed the CLI doctor fixture covering permission-composable misuse so the test now creates the
  expected app directory before writing the page file.
- Release policy checks now reject tracked `.pack`/build artifacts before they can
  leak into commits.

### ⚠️ Support Guidance

- The mainstream Trellis path remains: module setup -> composables -> auth -> permissions ->
  server helpers.
- Published npm entrypoints are listed in
  `apps/docs/content/docs/13.api-reference/7.api-surface.md`; if a subpath is not
  listed there, treat it as unavailable.

## v0.4.0

[compare changes](https://github.com/lupinum-dev/trellis/compare/v0.3.4...v0.4.0)

This release introduces the Trellis app-foundation refactor: explicit server
Convex callers, hardened auth boundaries, MCP operation safety, component bridge
package support, generated starter policy files, and stronger release checks.

### 🚀 Enhancements

- Added `@lupinum/trellis-bridge` as the package-author boundary for
  Trellis-aware Convex component integrations.
- Added explicit Nuxt server helpers for Convex queries, mutations, and actions,
  including trusted identity-forwarding envelopes for verified server-to-server
  calls.
- Added MCP operation safety primitives so destructive tools must run through the
  preview/confirmation/execute operation path.
- Added generated `AGENTS.md` policy files to starters so human maintainers and
  coding agents know the project rules immediately after `trellis init`.
- Added the generated API surface document that distinguishes npm package
  subpaths, Nuxt auto-imports, and generated Nuxt aliases.
- Added local development scripts for the maintained harness and local Convex
  verification.

#### Connection State

`useConvexConnectionState()` exposes connection health fields for reliable
offline/hydration UI:

| Property                | Description                                                      |
| ----------------------- | ---------------------------------------------------------------- |
| `hasEverConnected`      | `true` after the first successful WebSocket connection           |
| `hasInflightRequests`   | `true` while any mutation or action is in-flight                 |
| `connectionRetries`     | Number of reconnection attempts since last successful connection |
| `isHydratingConnection` | Suppresses offline UI during the initial hydration grace window  |

```ts
const {
  isConnected,
  hasEverConnected,
  hasInflightRequests,
  connectionRetries,
  isHydratingConnection,
  shouldShowOfflineUi,
} = useConvexConnectionState()
```

### 🩹 Fixes

- Auth proxy body size limits now use **incremental streaming reads** for both request and response bodies, rejecting oversized payloads as they arrive instead of buffering everything first. This reduces peak memory and makes limit enforcement reliable.
- Auth proxy response headers are now forwarded **after** body size validation, preventing partial header forwarding on oversized upstream responses.
- `decodeUserFromJwt` now validates that the JWT payload is a plain object before processing, preventing unexpected behavior on malformed tokens.
- Server-side helpers (`serverConvexQuery`, `serverConvexMutation`, `serverConvexAction`) now produce structured error messages with `helper`, `operation`, `functionPath`, `convexUrl`, and `authMode` context for easier debugging.
- Release pack checks reject `workspace:*` dependency ranges in publishable
  tarballs.

### 💅 Refactors

- `useConvexQuery` and `useConvexPaginatedQuery` internals extracted into a shared `createLiveQueryResource` helper, eliminating duplication and providing a consistent subscription lifecycle for both standard and lazy variants.
- `useConvexMutation` and `useConvexAction` now use a centralized `getRequiredConvexClient()` helper for Convex client access.
- Auth-related types (`AuthWaterfall`, `AuthWaterfallPhase`) moved to `utils/auth-debug` module.
- Auth token resolution extracted to `utils/auth-token` module (`resolveClientAuthToken`, `resolveServerAuthToken`).
- DevTools helper functions renamed for consistency (`registerDevtoolsEntry`, `updateDevtoolsEntrySuccess`, `updateDevtoolsEntryError`).

#### ⚠️ Breaking Changes

| Change                                                                                                       | Migration                                                         |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `inflightMutations` / `inflightActions` renamed to `pendingMutations` / `pendingActions` in connection state | Update any direct references to the renamed properties            |
| Custom JWT claims no longer forwarded onto `ConvexUser` from `decodeUserFromJwt`                             | Access custom claims from the raw JWT directly if needed          |
| `transformKey` option removed from `useConvexQuery`                                                          | Remove `transformKey` from options — results are applied directly |

### 📖 Documentation

- New server-side docs covering server routes, webhooks, and identity forwarding.
- New MCP docs covering safe read tools, scoped tools, destructive tools, and
  operation-backed execution.
- New deployment and production checklist docs.
- Updated API reference generated from the real package exports and module
  installer surface.

### ❤️ Contributors

- Mat4m0 <matthias.amon@me.com>

---

## v0.3.4

[compare changes](https://github.com/lupinum-dev/trellis/compare/v0.3.0...v0.3.4)

### 🏡 Chore

- **release:** V0.3.1 ([134fbdc](https://github.com/lupinum-dev/trellis/commit/134fbdc))
- Update .npmignore and nuxt.config.ts ([5133e3e](https://github.com/lupinum-dev/trellis/commit/5133e3e))
- Refine .npmignore to exclude additional unnecessary files ([1ad761a](https://github.com/lupinum-dev/trellis/commit/1ad761a))
- Bump version to v0.3.3 to fix npm release pipeline ([638c188](https://github.com/lupinum-dev/trellis/commit/638c188))

### ❤️ Contributors

- Mat4m0 <matthias.amon@me.com>

## v0.3.1

[compare changes](https://github.com/lupinum-dev/trellis/compare/v0.3.0...v0.3.1)

## v0.3.0

[compare changes](https://github.com/lupinum-dev/trellis/compare/v0.2.12...v0.3.0)

### 🚀 Enhancements

- Enhance permissions handling and DevTools integration ([2c3ec80](https://github.com/lupinum-dev/trellis/commit/2c3ec80))
- Add guard pages for pending authentication and enhance query handling ([8fd90d9](https://github.com/lupinum-dev/trellis/commit/8fd90d9))
- Enhance defineSharedConvexQuery with fingerprinting and duplicate key handling ([5b8e339](https://github.com/lupinum-dev/trellis/commit/5b8e339))
- Api polish, prepare for release ([a9fb1c3](https://github.com/lupinum-dev/trellis/commit/a9fb1c3))
- Api polish ([83728a5](https://github.com/lupinum-dev/trellis/commit/83728a5))
- Add consumer smoke test setup ([5cacd7c](https://github.com/lupinum-dev/trellis/commit/5cacd7c))

### 🩹 Fixes

- Enhance testing commands and improve local environment setup ([b0c2a09](https://github.com/lupinum-dev/trellis/commit/b0c2a09))
- Update TypeScript comment in nuxt.config.ts for clarity ([1eabe82](https://github.com/lupinum-dev/trellis/commit/1eabe82))
- Update CI workflow for module packing and verification ([55323c0](https://github.com/lupinum-dev/trellis/commit/55323c0))

### 💅 Refactors

- Auth ([157fd65](https://github.com/lupinum-dev/trellis/commit/157fd65))
- Enhance authentication configuration and documentation ([d09c42a](https://github.com/lupinum-dev/trellis/commit/d09c42a))
- Streamline Convex configuration and enhance authentication handling ([2d09cdb](https://github.com/lupinum-dev/trellis/commit/2d09cdb))
- Unify Convex configuration access across composables ([b78a514](https://github.com/lupinum-dev/trellis/commit/b78a514))
- ⚠️ Modernize Nuxt 4/Vue 3.5 runtime, harden auth proxy, and add cache-reuse recipe/demo ([7e7eb57](https://github.com/lupinum-dev/trellis/commit/7e7eb57))
- Update error handling and improve component structure ([6cefde9](https://github.com/lupinum-dev/trellis/commit/6cefde9))
- Migrate to useConvexAuth for authentication handling ([16f82c7](https://github.com/lupinum-dev/trellis/commit/16f82c7))
- Finish release Candidate ([a50ea1d](https://github.com/lupinum-dev/trellis/commit/a50ea1d))
- Split useConvexQuery => useConvexQueryLazy ([03852a9](https://github.com/lupinum-dev/trellis/commit/03852a9))
- Streamline Convex URL handling and improve site URL derivation ([0ff5c2f](https://github.com/lupinum-dev/trellis/commit/0ff5c2f))
- Update mutation handling and query arguments in playground components ([4f1c399](https://github.com/lupinum-dev/trellis/commit/4f1c399))
- Improve runtime configuration handling for Convex ([4d10fdc](https://github.com/lupinum-dev/trellis/commit/4d10fdc))

### 📖 Documentation

- Enhance documentation for HTTP-only mode in Convex queries ([b15f832](https://github.com/lupinum-dev/trellis/commit/b15f832))
- Update data fetching and pagination examples for reactive arguments ([d0fadb9](https://github.com/lupinum-dev/trellis/commit/d0fadb9))
- Enhance permissions setup and introduce upload queue functionality ([4228ae4](https://github.com/lupinum-dev/trellis/commit/4228ae4))
- Update import paths and enhance documentation for file storage and query handling ([6e17d3e](https://github.com/lupinum-dev/trellis/commit/6e17d3e))
- Enhance authentication and data fetching documentation ([1e35508](https://github.com/lupinum-dev/trellis/commit/1e35508))
- Update API surface documentation and generation script ([252ac6d](https://github.com/lupinum-dev/trellis/commit/252ac6d))
- Update query/mutation handling ([5b657bc](https://github.com/lupinum-dev/trellis/commit/5b657bc))
- Update mutation handling to use `execute()` instead of `mutate()` ([ae179a9](https://github.com/lupinum-dev/trellis/commit/ae179a9))

### 🏡 Chore

- **release:** V0.2.12 ([df71928](https://github.com/lupinum-dev/trellis/commit/df71928))
- Bump deps ([d8bbdbd](https://github.com/lupinum-dev/trellis/commit/d8bbdbd))
- Add Nuxt test-utils configuration and update dependencies ([e7c5f5c](https://github.com/lupinum-dev/trellis/commit/e7c5f5c))
- Update testing configurations and enhance test scripts ([78c5f0f](https://github.com/lupinum-dev/trellis/commit/78c5f0f))
- Polish and prepare beta ([5c03668](https://github.com/lupinum-dev/trellis/commit/5c03668))
- Update pnpm-lock.yaml to include @vitejs/plugin-vue ([3a95bd9](https://github.com/lupinum-dev/trellis/commit/3a95bd9))
- Add Playwright browser installation step in CI workflow ([d979e22](https://github.com/lupinum-dev/trellis/commit/d979e22))
- Update playground for new API ([3746396](https://github.com/lupinum-dev/trellis/commit/3746396))
- Enhance playground configuration and logging ([a288f22](https://github.com/lupinum-dev/trellis/commit/a288f22))
- Update project configuration and improve mutation handling ([96645b1](https://github.com/lupinum-dev/trellis/commit/96645b1))
- Clean up nuxt.config.ts by removing unnecessary whitespace ([62dc1d1](https://github.com/lupinum-dev/trellis/commit/62dc1d1))
- Update deps & format ([16e0b8f](https://github.com/lupinum-dev/trellis/commit/16e0b8f))
- Update dependencies and Renovate configuration ([1e7e9e0](https://github.com/lupinum-dev/trellis/commit/1e7e9e0))
- Prepare package version for release ([7dd3ee7](https://github.com/lupinum-dev/trellis/commit/7dd3ee7))

### ✅ Tests

- Improve selector logic in useConvexConnectionState behavior tests ([e7fddb2](https://github.com/lupinum-dev/trellis/commit/e7fddb2))
- Enhance connection state behavior tests with improved waiting logic ([b3285a7](https://github.com/lupinum-dev/trellis/commit/b3285a7))
- Harden dedup, permission guard, and optimistic update coverage ([6a33a8a](https://github.com/lupinum-dev/trellis/commit/6a33a8a))
- Add end-to-end test for plugin server misconfiguration overlay ([b33601e](https://github.com/lupinum-dev/trellis/commit/b33601e))

#### ⚠️ Breaking Changes

- ⚠️ Modernize Nuxt 4/Vue 3.5 runtime, harden auth proxy, and add cache-reuse recipe/demo ([7e7eb57](https://github.com/lupinum-dev/trellis/commit/7e7eb57))

### ❤️ Contributors

- Mat4m0 <matthias.amon@me.com>
