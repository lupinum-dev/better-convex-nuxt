# Changelog

## Unreleased

### 🚀 Enhancements

- `useConvexQuery()` and `useConvexPaginatedQuery()` now expose `isStale`, making it possible to distinguish "showing previous args while refreshing" from initial loading, skipped queries, and steady-state data.
- Server auth resolution is now shared per request across SSR hydration and `serverConvexQuery()` / `serverConvexMutation()` / `serverConvexAction()`, avoiding repeated cookie parsing and token exchange within the same Nitro request.

### 📖 Documentation

- Added docs and API reference coverage for `isStale` and request-scoped server auth reuse.

### Scope

- No new auth modes were added in this pass.
- No headless or external-session auth support was added in this pass.
- No `expectAuth` query mode was added in this pass.

## v0.4.0

[compare changes](https://github.com/lupinum-dev/better-convex-nuxt/compare/v0.3.4...v0.4.0)

This release introduces the **private bridge** for privileged server-only Convex operations, **lazy query variants** for layout-safe usage, an improved connection state API, local development support, and significant internal hardening of the auth proxy and error handling.

### 🚀 Enhancements

#### Lazy Query Composables

Two new composable variants return refs **immediately** without blocking `setup()`. Use them in layouts, reusable composables, or anywhere `await` is not appropriate:

- **`useConvexQueryLazy`** — non-blocking variant of `useConvexQuery`
- **`useConvexPaginatedQueryLazy`** — non-blocking variant of `useConvexPaginatedQuery`

```ts
// Safe inside layouts — no await needed
const { data, pending, status } = useConvexQueryLazy(api.users.me, {})

// Paginated
const { results, status, loadMore } = useConvexPaginatedQueryLazy(
  api.messages.list,
  {},
  { initialNumItems: 20 }
)
```

Standard `useConvexQuery` / `useConvexPaginatedQuery` with `await` remain the recommended choice for pages where blocking SSR is desired.

#### App-Local Private Bridge

A new "private bridge" pattern lets Nuxt **server routes** call backend-only Convex functions without a user identity. This is designed for cron jobs, webhooks, and admin operations that must bypass user auth.

The bridge is secured with a `PRIVATE_BRIDGE_KEY` environment variable shared between your Nuxt server and your Convex deployment.

```ts
// server/api/admin/report.get.ts
import { privateConvexQuery } from '~/server/utils/private-convex'
import { privateFunctions } from '~/private-function-references'

export default defineEventHandler(async () => {
  return privateConvexQuery(privateFunctions.admin.generateReport, {})
})
```

See the [Server Call Lanes](./docs/content/docs/5.server-side/3.server-call-lanes.md) guide for setup including environment variables and security model.

#### New `useConvexConnectionState` Properties

Three new computed properties are now exposed:

| Property | Description |
|---|---|
| `hasEverConnected` | `true` after the first successful WebSocket connection |
| `hasInflightRequests` | `true` while any mutation or action is in-flight |
| `connectionRetries` | Number of reconnection attempts since last successful connection |
| `isHydratingConnection` | Suppresses offline UI during the initial hydration grace window |

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

#### Local Development with `convex-vite-plugin`

The module now supports running a local Convex backend via `@convex-dev/convex-vite-plugin`. Point `NUXT_PUBLIC_CONVEX_URL` at `http://127.0.0.1:3210` and use the new `dev:local` scripts. See [Local Development](./docs/content/docs/8.deployment/0.local-development.md).

### 🩹 Fixes

- Auth proxy body size limits now use **incremental streaming reads** for both request and response bodies, rejecting oversized payloads as they arrive instead of buffering everything first. This reduces peak memory and makes limit enforcement reliable.
- Auth proxy response headers are now forwarded **after** body size validation, preventing partial header forwarding on oversized upstream responses.
- Private bridge API route returns **404** in production when accessed without the correct key, avoiding leakage of the privileged endpoint's existence.
- `decodeUserFromJwt` now validates that the JWT payload is a plain object before processing, preventing unexpected behavior on malformed tokens.
- Server-side helpers (`serverConvexQuery`, `serverConvexMutation`, `serverConvexAction`) now produce structured error messages with `helper`, `operation`, `functionPath`, `convexUrl`, and `authMode` context for easier debugging.

### 💅 Refactors

- `useConvexQuery` and `useConvexPaginatedQuery` internals extracted into a shared `createLiveQueryResource` helper, eliminating duplication and providing a consistent subscription lifecycle for both standard and lazy variants.
- `useConvexMutation` and `useConvexAction` now use a centralized `getRequiredConvexClient()` helper for Convex client access.
- Auth-related types (`AuthWaterfall`, `AuthWaterfallPhase`) moved to `utils/auth-debug` module.
- Auth token resolution extracted to `utils/auth-token` module (`resolveClientAuthToken`, `resolveServerAuthToken`).
- DevTools helper functions renamed for consistency (`registerDevtoolsEntry`, `updateDevtoolsEntrySuccess`, `updateDevtoolsEntryError`).

#### ⚠️ Breaking Changes

| Change | Migration |
|---|---|
| `inflightMutations` / `inflightActions` renamed to `pendingMutations` / `pendingActions` in connection state | Update any direct references to the renamed properties |
| Custom JWT claims no longer forwarded onto `ConvexUser` from `decodeUserFromJwt` | Access custom claims from the raw JWT directly if needed |
| `transformKey` option removed from `useConvexQuery` | Remove `transformKey` from options — results are applied directly |

### 📖 Documentation

- New [Server Call Lanes](./docs/content/docs/5.server-side/3.server-call-lanes.md) guide covering public, authenticated, and private bridge lanes
- New [Local Development](./docs/content/docs/8.deployment/0.local-development.md) guide for `convex-vite-plugin` setup
- Updated query and pagination docs with lazy variant examples
- Updated connection state docs for new computed properties
- Added callout notes for SSR usage of `useConvexMutation` and `useConvexAction`
- New deployment guides: [Overview](./docs/content/docs/8.deployment/1.overview.md), [Environment Matrix](./docs/content/docs/8.deployment/2.environment-matrix.md), [Vercel](./docs/content/docs/8.deployment/3.vercel.md), [Troubleshooting](./docs/content/docs/8.deployment/4.troubleshooting.md)

### ❤️ Contributors

- Mat4m0 <matthias.amon@me.com>

---

## v0.3.4

[compare changes](https://github.com/lupinum-dev/better-convex-nuxt/compare/v0.3.0...v0.3.4)

### 🏡 Chore

- **release:** V0.3.1 ([134fbdc](https://github.com/lupinum-dev/better-convex-nuxt/commit/134fbdc))
- Update .npmignore and nuxt.config.ts ([5133e3e](https://github.com/lupinum-dev/better-convex-nuxt/commit/5133e3e))
- Refine .npmignore to exclude additional unnecessary files ([1ad761a](https://github.com/lupinum-dev/better-convex-nuxt/commit/1ad761a))
- Bump version to v0.3.3 to fix npm release pipeline ([638c188](https://github.com/lupinum-dev/better-convex-nuxt/commit/638c188))

### ❤️ Contributors

- Mat4m0 <matthias.amon@me.com>

## v0.3.1

[compare changes](https://github.com/lupinum-dev/better-convex-nuxt/compare/v0.3.0...v0.3.1)

## v0.3.0

[compare changes](https://github.com/lupinum-dev/better-convex-nuxt/compare/v0.2.12...v0.3.0)

### 🚀 Enhancements

- Enhance permissions handling and DevTools integration ([2c3ec80](https://github.com/lupinum-dev/better-convex-nuxt/commit/2c3ec80))
- Add guard pages for pending authentication and enhance query handling ([8fd90d9](https://github.com/lupinum-dev/better-convex-nuxt/commit/8fd90d9))
- Enhance defineSharedConvexQuery with fingerprinting and duplicate key handling ([5b8e339](https://github.com/lupinum-dev/better-convex-nuxt/commit/5b8e339))
- Api polish, prepare for release ([a9fb1c3](https://github.com/lupinum-dev/better-convex-nuxt/commit/a9fb1c3))
- Api polish ([83728a5](https://github.com/lupinum-dev/better-convex-nuxt/commit/83728a5))
- Add consumer smoke test setup ([5cacd7c](https://github.com/lupinum-dev/better-convex-nuxt/commit/5cacd7c))

### 🩹 Fixes

- Enhance testing commands and improve local environment setup ([b0c2a09](https://github.com/lupinum-dev/better-convex-nuxt/commit/b0c2a09))
- Update TypeScript comment in nuxt.config.ts for clarity ([1eabe82](https://github.com/lupinum-dev/better-convex-nuxt/commit/1eabe82))
- Update CI workflow for module packing and verification ([55323c0](https://github.com/lupinum-dev/better-convex-nuxt/commit/55323c0))

### 💅 Refactors

- Auth ([157fd65](https://github.com/lupinum-dev/better-convex-nuxt/commit/157fd65))
- Enhance authentication configuration and documentation ([d09c42a](https://github.com/lupinum-dev/better-convex-nuxt/commit/d09c42a))
- Streamline Convex configuration and enhance authentication handling ([2d09cdb](https://github.com/lupinum-dev/better-convex-nuxt/commit/2d09cdb))
- Unify Convex configuration access across composables ([b78a514](https://github.com/lupinum-dev/better-convex-nuxt/commit/b78a514))
- ⚠️  Modernize Nuxt 4/Vue 3.5 runtime, harden auth proxy, and add cache-reuse recipe/demo ([7e7eb57](https://github.com/lupinum-dev/better-convex-nuxt/commit/7e7eb57))
- Update error handling and improve component structure ([6cefde9](https://github.com/lupinum-dev/better-convex-nuxt/commit/6cefde9))
- Migrate to useConvexAuth for authentication handling ([16f82c7](https://github.com/lupinum-dev/better-convex-nuxt/commit/16f82c7))
- Finish release Candidate ([a50ea1d](https://github.com/lupinum-dev/better-convex-nuxt/commit/a50ea1d))
- Split useConvexQuery => useConvexQueryLazy ([03852a9](https://github.com/lupinum-dev/better-convex-nuxt/commit/03852a9))
- Streamline Convex URL handling and improve site URL derivation ([0ff5c2f](https://github.com/lupinum-dev/better-convex-nuxt/commit/0ff5c2f))
- Update mutation handling and query arguments in playground components ([4f1c399](https://github.com/lupinum-dev/better-convex-nuxt/commit/4f1c399))
- Improve runtime configuration handling for Convex ([4d10fdc](https://github.com/lupinum-dev/better-convex-nuxt/commit/4d10fdc))

### 📖 Documentation

- Enhance documentation for HTTP-only mode in Convex queries ([b15f832](https://github.com/lupinum-dev/better-convex-nuxt/commit/b15f832))
- Update data fetching and pagination examples for reactive arguments ([d0fadb9](https://github.com/lupinum-dev/better-convex-nuxt/commit/d0fadb9))
- Enhance permissions setup and introduce upload queue functionality ([4228ae4](https://github.com/lupinum-dev/better-convex-nuxt/commit/4228ae4))
- Update import paths and enhance documentation for file storage and query handling ([6e17d3e](https://github.com/lupinum-dev/better-convex-nuxt/commit/6e17d3e))
- Enhance authentication and data fetching documentation ([1e35508](https://github.com/lupinum-dev/better-convex-nuxt/commit/1e35508))
- Update API surface documentation and generation script ([252ac6d](https://github.com/lupinum-dev/better-convex-nuxt/commit/252ac6d))
- Update query/mutation handling ([5b657bc](https://github.com/lupinum-dev/better-convex-nuxt/commit/5b657bc))
- Update mutation handling to use `execute()` instead of `mutate()` ([ae179a9](https://github.com/lupinum-dev/better-convex-nuxt/commit/ae179a9))

### 🏡 Chore

- **release:** V0.2.12 ([df71928](https://github.com/lupinum-dev/better-convex-nuxt/commit/df71928))
- Bump deps ([d8bbdbd](https://github.com/lupinum-dev/better-convex-nuxt/commit/d8bbdbd))
- Add Nuxt test-utils configuration and update dependencies ([e7c5f5c](https://github.com/lupinum-dev/better-convex-nuxt/commit/e7c5f5c))
- Update testing configurations and enhance test scripts ([78c5f0f](https://github.com/lupinum-dev/better-convex-nuxt/commit/78c5f0f))
- Polish and prepare beta ([5c03668](https://github.com/lupinum-dev/better-convex-nuxt/commit/5c03668))
- Update pnpm-lock.yaml to include @vitejs/plugin-vue ([3a95bd9](https://github.com/lupinum-dev/better-convex-nuxt/commit/3a95bd9))
- Add Playwright browser installation step in CI workflow ([d979e22](https://github.com/lupinum-dev/better-convex-nuxt/commit/d979e22))
- Update playground for new API ([3746396](https://github.com/lupinum-dev/better-convex-nuxt/commit/3746396))
- Enhance playground configuration and logging ([a288f22](https://github.com/lupinum-dev/better-convex-nuxt/commit/a288f22))
- Update project configuration and improve mutation handling ([96645b1](https://github.com/lupinum-dev/better-convex-nuxt/commit/96645b1))
- Clean up nuxt.config.ts by removing unnecessary whitespace ([62dc1d1](https://github.com/lupinum-dev/better-convex-nuxt/commit/62dc1d1))
- Update deps & format ([16e0b8f](https://github.com/lupinum-dev/better-convex-nuxt/commit/16e0b8f))
- Update dependencies and Renovate configuration ([1e7e9e0](https://github.com/lupinum-dev/better-convex-nuxt/commit/1e7e9e0))
- Prepare package version for release ([7dd3ee7](https://github.com/lupinum-dev/better-convex-nuxt/commit/7dd3ee7))

### ✅ Tests

- Improve selector logic in useConvexConnectionState behavior tests ([e7fddb2](https://github.com/lupinum-dev/better-convex-nuxt/commit/e7fddb2))
- Enhance connection state behavior tests with improved waiting logic ([b3285a7](https://github.com/lupinum-dev/better-convex-nuxt/commit/b3285a7))
- Harden dedup, permission guard, and optimistic update coverage ([6a33a8a](https://github.com/lupinum-dev/better-convex-nuxt/commit/6a33a8a))
- Add end-to-end test for plugin server misconfiguration overlay ([b33601e](https://github.com/lupinum-dev/better-convex-nuxt/commit/b33601e))

#### ⚠️ Breaking Changes

- ⚠️  Modernize Nuxt 4/Vue 3.5 runtime, harden auth proxy, and add cache-reuse recipe/demo ([7e7eb57](https://github.com/lupinum-dev/better-convex-nuxt/commit/7e7eb57))

### ❤️ Contributors

- Mat4m0 <matthias.amon@me.com>
