# Changelog

## Unreleased

### Security hardening (breaking)

- Fixed the auth proxy to one same-origin `/api/auth` route, GET/POST only, with one validated upstream request and no server-side redirect following.
- Removed cross-origin CORS/trusted-origin options, custom proxy routes, and the cross-request JWT cache and clear helper.
- Stripped caller-controlled proxy headers, preserved request bytes, and kept one deadline through complete response consumption.
- Made Better Auth's public reactive session the canonical client identity source, including raw/plugin operations, MFA, expiry, and cross-tab logout.
- Serialized complete sign-in, sign-up, and sign-out operations and added mandatory security regression tests.
- Added deterministic isolated E2E execution, real Nitro proxy probes, seeded proxy property tests, and a two-tab session/account-switch matrix.
- Added a machine-checked OWASP ASVS 5.0.0 Level 2 responsibility/evidence ledger covering all 253 applicable Level 1/2 controls.
- Added production dependency auditing, CycloneDX SBOM generation, secret scanning, CodeQL, pinned CI actions, Dependabot, and security release gates.
- Narrowed the supported Nuxt peer range to `^4.4.0`; Better Auth and its Convex adapter remain exact-version integration dependencies.

## v0.6.0

[compare changes](https://github.com/lupinum-dev/better-convex-nuxt/compare/v0.5.0...v0.6.0)

This is the vNext hard cutover. It replaces the pre-0.6 auth, query-argument,
error, and server-call surfaces outright — there is no compatibility shim and
no deprecation period. Upgrading requires reading the sections below; most
consumers will need source changes.

### 💥 Breaking changes

**Auth installation, config, and runtime topology**

- Removed `auth.enabled` as a separate boolean. Authentication now installs by
  default (or via an options object); pass `auth: false` as the sole
  off-switch. `defaults.auth` no longer exists.
- Removed `auth.cache.enabled` and `auth.unauthorized.enabled`/`auth.unauthorized`.
  The auth cache option is now a plain `false | options` value with no nested
  `enabled` flag, and unauthorized-route recovery no longer exists in module
  options, runtime config, or source.
- Removed `auth: 'auto'`. Query auth modes are exactly `required | optional | none`,
  with identical meaning on client and server. The default mode is `optional`.

**Query modes and cross-identity isolation**

- `optional`/`required` queries now wait for initial auth settlement before
  running, and are partitioned by the caller's stable identity key plus an
  `identityGeneration` counter — no query, paginated page, optimistic update,
  mutation/action result, upload, callback, or seeded-profile state can leak
  across a sign-in/sign-out/user-switch boundary.
- `none` queries always use a dedicated, permanently anonymous transport and
  never observe a Convex identity, even when the app is otherwise signed in.
- Same-user token rotation (refresh) no longer forces query reacquisition.
- Every identity-key change (anonymous↔user, user↔user) retires and closes the
  previous primary `ConvexClient` and replaces it; the public `useConvex()`
  handle and the dedicated anonymous client stay stable across the swap.

**Explicit query arguments; surface removal**

- Queries must always be called with an explicit args object or the literal
  string `'skip'`. Omitted-argument calls (e.g. `useConvexQuery(api.x.y)`) are
  no longer accepted.
- Removed `getQueryKey` and the `better-convex-nuxt/composables` subpath.
  Public types are imported from the package root.

**`ConvexCallError`**

- Introduced `ConvexCallError` as the one public error type for both throwing
  and safe (`{ data, error }`-style) call paths. It survives Nitro/SSR
  serialization with its identity and public fields (`kind`, `code`, `message`,
  `status`, `data`) intact; `cause` is never serialized or logged.
- Unstructured upstream response bodies can no longer reach public errors,
  logs, or payloads.

**Typed Better Auth client**

- Better Auth client plugins are now registered once per Nuxt app through
  `defineConvexAuthClient` in a project's `convex-auth.ts`, using the
  framework-free `better-convex-nuxt/auth-client` entry. Removed
  `createBetterConvexAuthClient`, `resolveBetterConvexAuthBaseURL`, and the
  `BetterConvexAuthClientOptions`/`BetterConvexAuthClientPluginList` types.

**Atomic sign-in/sign-up**

- `signIn`/`signUp` now synchronize the Convex identity automatically as part
  of the call; there is no manual post-sign-in/sign-up refresh step. `refresh()`
  remains available only for advanced raw-client or claim-change flows.
- `useConvexAuth()` is available both when auth is enabled and when it is
  disabled (module option `auth: false`), reporting status `'disabled'` in the
  latter case.

**Server caller and credential exchange**

- `serverConvex` is now the only public server call API. Removed
  `serverConvexQuery`, `serverConvexMutation`, `serverConvexAction`, and
  `useConvexCall`.
- Cookie and bearer credential exchange is bounded, never follows a redirect
  with the credential attached, and never logs secrets.
- Removed the built-in `permissions` module option (both the `true` and
  `false` states) and the `createPermissions` permissions runtime. Permission
  rules are application/Convex policy, not library machinery. Replace package
  permission helpers with an application-owned UI capability composable backed
  by Convex queries, and continue enforcing authorization inside Convex handlers.

### 🧹 Cleanup

- Deleted `research/` and `experiments/` (concluded Phase 0 exploration,
  distilled into `src/ARCHITECTURE.md` and ADRs where durable; retained only in
  Git history).
- Removed the Phase 0 `test/proofs/auth-races`, `test/proofs/isolation`,
  `test/proofs/onupdate-rebinding`, and `test/proofs/ssr-errors` prototype
  fixtures; their guarantees are now covered by permanent unit, Nuxt, and e2e
  tests (`test/unit/auth-generation-races.test.ts`, `test/unit/client-owner.test.ts`,
  `test/nuxt/auth-two-app-isolation.nuxt.test.ts`,
  `test/e2e/ssr-errors-consumer.e2e.test.ts`, and related identity/anonymous-
  transport Nuxt tests).

### 📖 Documentation

- Rewrote guides and examples onto the final vNext API (explicit query args,
  `optional`-by-default auth modes, `serverConvex`, `defineConvexAuthClient`,
  the replacement-safe `useConvex()` handle, structured error classification,
  and application-owned UI capabilities).

## v0.5.0

[compare changes](https://github.com/lupinum-dev/better-convex-nuxt/compare/v0.4.0...v0.5.0)

### 🩹 Fixes

- Remove unnecessary override for parent workspace in pnpm configuration ([7f6b2bb0](https://github.com/lupinum-dev/better-convex-nuxt/commit/7f6b2bb0))

### 💅 Refactors

- Simplify landing feature syntax in documentation ([eef25d41](https://github.com/lupinum-dev/better-convex-nuxt/commit/eef25d41))

### ❤️ Contributors

- Mat4m0 <matthias.amon@me.com>

## v0.4.0

[compare changes](https://github.com/lupinum-dev/better-convex-nuxt/compare/v0.3.4...v0.4.0)

Reconstructed from the tagged commit range and the published `0.4.0` npm
release; this section was missing from the changelog until the vNext Phase 6
repair. No new facts beyond what the commit range and the release itself
show — see the [`v0.4.0` GitHub release](https://github.com/lupinum-dev/better-convex-nuxt/releases/tag/v0.4.0)
and the [published package](https://www.npmjs.com/package/better-convex-nuxt/v/0.4.0)
for the authoritative record if this summary is ever in question.

### 🚀 Enhancements

- Export `ConvexUser` from the module entrypoint ([c78b6926](https://github.com/lupinum-dev/better-convex-nuxt/commit/c78b6926))
- Harden starters and add the MCP approval flow, including Convex Nuxt runtime
  contract hardening, SSR-safe mutation callables, extracted server auth
  snapshot/shared-query/upload-queue/paginated-query internals, unified live
  query subscriptions, and a Better Auth Organization-backed team starter
  ([6fbf0bd5](https://github.com/lupinum-dev/better-convex-nuxt/commit/6fbf0bd5))

### 🩹 Fixes

- Prepare starters and demo for the `0.4.0` release ([d18763fb](https://github.com/lupinum-dev/better-convex-nuxt/commit/d18763fb))

### ❤️ Contributors

- Mat4m0 <matthias.amon@me.com>

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
- ⚠️ Modernize Nuxt 4/Vue 3.5 runtime, harden auth proxy, and add cache-reuse recipe/demo ([7e7eb57](https://github.com/lupinum-dev/better-convex-nuxt/commit/7e7eb57))
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

- ⚠️ Modernize Nuxt 4/Vue 3.5 runtime, harden auth proxy, and add cache-reuse recipe/demo ([7e7eb57](https://github.com/lupinum-dev/better-convex-nuxt/commit/7e7eb57))

### ❤️ Contributors

- Mat4m0 <matthias.amon@me.com>
