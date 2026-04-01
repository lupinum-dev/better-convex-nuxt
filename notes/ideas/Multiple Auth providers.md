# Multi-Provider Auth First-Class Support

## Summary

Replace the Better Auth-specific auth layer with a provider-agnostic core and ship three first-party provider integrations in one feature line: Better Auth, Clerk, and WorkOS AuthKit.

This is a hard cutover. The new model makes `better-convex-nuxt` responsible for Convex auth state, SSR hydration, route protection, and server helper auth, while each provider integration owns its own SDK/session/token mechanics. Convex remains the source of truth for org membership, roles, and permissions.

## Key Changes

### 1. Replace the current auth model with a provider core

- Introduce a provider definition contract used by the module, auth engine, SSR resolver, and client transport.
- Move all direct Better Auth imports and assumptions out of the generic runtime in [src/runtime/client](/Users/matthias/Git/0_libs/better-convex-nuxt/src/runtime/client) and [src/runtime/server](/Users/matthias/Git/0_libs/better-convex-nuxt/src/runtime/server).
- The provider contract must own:
  - client token acquisition / refresh
  - server token acquisition from the current request
  - sign-out / session invalidation behavior
  - provider user normalization into `ConvexUser`
  - optional server route/proxy registration
  - provider composable registration

### 2. Hard-cut the public API to provider-neutral core + provider composables

- Change `useConvexAuth()` to state only:
  - keep `user`, `isAuthenticated`, `isPending`, `isAnonymous`, `isSessionExpired`, `authError`, `refreshAuth`
  - remove `client`
  - remove `signOut`
- Remove `useConvexAuthActions()` entirely.
- Remove `$auth` from Nuxt/Vue typings.
- Add provider-specific composables:
  - `useConvexBetterAuth()`
  - `useConvexClerkAuth()`
  - `useConvexWorkOSAuth()`
- Each provider composable exposes provider-native actions and the raw provider SDK object when applicable. No fake cross-provider sign-in API is added.
- Keep existing generic route protection, unauthorized handling, and `convex:auth:changed` hooks unchanged at the semantic level.

### 3. Replace config with explicit provider selection

- Remove boolean auth shorthand and implicit Better Auth defaulting.
- Require explicit provider configuration when auth is enabled.
- New shape:
  - `convex.auth.provider = betterAuthProvider(...) | clerkProvider(...) | workosProvider(...)`
  - `routeProtection`, `unauthorized`, cache settings, and other Convex concerns stay in common auth config
  - provider-specific options live in the provider factory, not in a giant discriminated object inside `src/module.ts`
- Export provider factories from subpaths:
  - `better-convex-nuxt/providers/better-auth`
  - `better-convex-nuxt/providers/clerk`
  - `better-convex-nuxt/providers/workos`

### 4. Implement first-party provider packages

- Better Auth provider:
  - preserve current cookie + `/api/auth/convex/token` flow internally
  - keep the auth proxy, cache invalidation, and existing SSR behavior
  - move all Better Auth-specific docs/examples behind this provider
- Clerk provider:
  - integrate with official [`@clerk/nuxt` `useAuth()`](https://clerk.com/docs/nuxt/reference/composables/use-auth)
  - use Clerk token retrieval for client/SSR auth
  - document Convex setup using the official [Convex Clerk JWT configuration](https://docs.convex.dev/auth/clerk)
  - no Better Auth-style proxy route
- WorkOS provider:
  - target WorkOS AuthKit specifically, using the official [Convex AuthKit integration](https://docs.convex.dev/auth/authkit/) and WorkOS access-token/session APIs
  - no Better Auth-style proxy route
  - no WorkOS Directory Sync/Admin Portal abstraction in this feature

### 5. Make docs/examples/provider language neutral

- Rewrite auth docs around “Auth Providers” instead of “Better Auth”.
- Split into:
  - shared auth core guide
  - Better Auth provider guide
  - Clerk provider guide
  - WorkOS AuthKit provider guide
- Update API reference to reflect the new core/provider split.
- Update examples, playground references, and fixtures to stop calling provider identity IDs “Better Auth IDs”.
- Rename example/playground schema terminology from `authId` to `subjectId` where it represents `ctx.auth.getUserIdentity().subject`.

## Public API / Interface Changes

- `useConvexAuth()` becomes provider-agnostic state only.
- `useConvexAuthActions()` is removed.
- `NuxtApp.$auth` and Vue `$auth` are removed.
- `auth: true` and other implicit Better Auth shorthands are removed.
- New provider factory exports are added under provider subpaths.
- New provider composables are added; only the configured provider’s composable is documented as the supported app-facing entrypoint.

## Test Plan

- Refactor current auth tests into provider-agnostic core tests plus provider contract tests.
- Keep Better Auth parity coverage for:
  - SSR hydration
  - auth proxy behavior
  - sign-out cache invalidation
  - route protection
  - server helper auth
- Add Clerk coverage for:
  - client token acquisition and refresh
  - SSR authenticated query/mutation flow
  - route protection waiting on Convex auth readiness
  - sign-out propagation
- Add WorkOS AuthKit coverage for:
  - access token acquisition and refresh
  - SSR authenticated query/mutation flow
  - route protection waiting on Convex auth readiness
  - sign-out propagation
- Add consumer smoke fixtures for all three providers.
- Keep tenant/permissions tests provider-neutral: only `identity.subject` matters.

## Assumptions And Defaults

- Convex remains the source of truth for organizations, roles, and permissions.
- Clerk and WorkOS support means identity/session integration only; provider org models do not become authoritative.
- WorkOS support targets AuthKit, not the broader WorkOS product set.
- Provider SDK setup remains the user’s responsibility; this package integrates with official SDKs rather than replacing them.
- Required user state for `useConvexAuth().user` is only a stable subject; `name`, `email`, and avatar are best-effort normalized from provider token/session data.
- The plan follows a clean break rather than deprecations or compatibility shims.
