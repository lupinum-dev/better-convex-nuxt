# Auth Refactor Notes

This document summarizes the recent auth refactor, why each change was made, potential downsides, and the expected benefits.

## Goals

- Eliminate SSR/CSR race conditions and redirect flicker.
- Make auth readiness explicit and deterministic.
- Centralize session sync logic to reduce duplicate auth requests.
- Ensure logout invalidates server cache in SSR environments.

## Changes and Rationale

### 1) Explicit auth readiness state

**What changed**
- Added a shared `convex:authReady` state and ensured it is set on every SSR/CSR auth resolution path.
- Server plugin now finalizes `convex:authReady` and clears `convex:pending` for all exit paths.
- Client plugin marks readiness after token resolution or when auth is disabled/misconfigured.

**Why**
- `isPending` alone does not reliably indicate when auth is fully resolved, especially with SSR hydration.
- Middleware and UI can make incorrect decisions during the gap between hydration and session sync.

**Potential downside**
- Slightly more state to maintain and reason about in custom app code.

**Expected positive**
- Deterministic auth state; fewer redirect races and less UI flicker.

---

### 2) Centralized session sync

**What changed**
- Extracted session login/logout handling into a single `syncAuth()` flow on the client.
- Ensures abort handling, pending state, and token refresh logic happen in one place.

**Why**
- Previous flow duplicated logic across multiple branches, which can cause out-of-order updates and race conditions.

**Potential downside**
- Slightly more abstraction in the plugin; debugging may require reading a single function instead of inline code.

**Expected positive**
- Fewer state inconsistencies and more predictable login/logout behavior.

---

### 3) Logout cache invalidation endpoint

**What changed**
- Added `DELETE /api/convex/auth-cache` to clear cached SSR tokens by session cookie.
- Client calls it on logout.

**Why**
- SSR token cache can serve stale tokens after logout without an explicit invalidation.

**Potential downside**
- Extra network call on logout (one small HTTP request).

**Expected positive**
- SSR won’t hydrate stale sessions after logout; more reliable auth state.

---

### 4) Auth-aware UI components

**What changed**
- `ConvexAuthLoading`, `ConvexAuthenticated`, `ConvexUnauthenticated`, and `ConvexAuthError` now also respect `authReady`.

**Why**
- UI should not render final authenticated/unauthenticated states until auth is fully resolved.

**Potential downside**
- Slightly delayed rendering in edge cases where auth resolves later than before.

**Expected positive**
- No premature unauthenticated UI flashes during SSR hydration.

---

### 5) Auth readiness composables

**What changed**
- Added `useAuthReady()` and `useRequireAuth()` composables.

**Why**
- App code can now depend on explicit readiness without directly touching `useState` keys.
- Provides a standard, predictable gating pattern for protected pages.

**Potential downside**
- New API surface that needs to be documented and maintained.

**Expected positive**
- Easier, consistent auth handling across the app.

---

### 6) Demo auth middleware update

**What changed**
- Demo route middleware now waits for `authReady` and redirects to `/signin`.

**Why**
- Ensures SSR and CSR follow the same readiness contract, avoiding redirect races.

**Potential downside**
- If `authReady` never flips due to misconfiguration, protected routes will not redirect.

**Expected positive**
- Cleaner, more deterministic auth behavior in SSR.

## Summary of Files Touched

- `src/runtime/plugin.server.ts`
- `src/runtime/plugin.client.ts`
- `src/runtime/composables/useConvexAuth.ts`
- `src/runtime/composables/useAuthReady.ts`
- `src/runtime/composables/useRequireAuth.ts`
- `src/runtime/composables/index.ts`
- `src/runtime/components/ConvexAuthLoading.vue`
- `src/runtime/components/ConvexAuthenticated.vue`
- `src/runtime/components/ConvexUnauthenticated.vue`
- `src/runtime/components/ConvexAuthError.vue`
- `src/runtime/server/api/convex/auth-cache.ts`
- `demo/app/middleware/auth.ts`

## Quick Expectations

- SSR auth becomes deterministic and fully resolved before middleware decisions.
- Login/logout transitions update state consistently.
- Logout no longer risks rehydrating stale sessions from SSR cache.
- UI no longer renders incorrect auth state during hydration.
