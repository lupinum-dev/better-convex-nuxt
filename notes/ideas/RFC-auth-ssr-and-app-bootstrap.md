# RFC: SSR Auth, App Bootstrap, and Query Gating

**Status:** Draft
**Author:** Codex / Matthias discussion
**Date:** 2026-03-31
**Module:** better-convex-nuxt

---

## Summary

This RFC clarifies how `better-convex-nuxt` should think about SSR when auth is involved.

The key conclusion is:

- **Auth does not invalidate SSR.**
- **SSR auth hydration is a strength of the plugin.**
- The real difficulty starts **after auth is known**, when an app needs extra bootstrap work before authenticated queries can safely run.

In the current examples, that bootstrap is represented by "ensure the app-level user row exists". The question is not whether SSR should be disabled for authenticated pages. The question is **where that extra bootstrap belongs**:

1. on the client after hydration
2. in a page-level SSR bootstrap step
3. deeper in the auth or shared server data path

This RFC recommends keeping SSR auth as a core feature, treating page-level bootstrap as a valid but limited pattern, and steering larger apps toward a deeper provisioning model.

---

## Background

The plugin already supports a strong SSR auth story:

- the server can read the Better Auth session cookie
- the server can exchange that cookie for a Convex token
- the authenticated user can be hydrated into client state
- the first render can avoid a flash of anonymous or pending auth state

That part is working well and should remain a core part of the product story.

The complication appears when authenticated data does **not** become queryable immediately after auth resolution.

Example pattern:

1. Better Auth says the user is authenticated
2. the app expects a local row in a `users` table
3. authenticated queries depend on an actor derived from that local row
4. the row may not exist yet, or may not be visible yet
5. the page must choose where to bridge that timing gap

This is an **application bootstrap** problem, not an "SSR with auth is bad" problem.

---

## Problem Statement

Today, authenticated pages may need to wait for app-specific bootstrap before running Convex queries.

Typical symptoms:

- a short loading state appears even though auth is already resolved
- authenticated queries are gated behind `undefined` args or similar conditional logic
- bootstrap may currently happen in client-only code such as `useEnsureConvexUser()`
- as more authenticated queries are added, one bootstrap step can fan out to multiple dependent queries

Without clear guidance, users can draw the wrong conclusion:

- "auth pages should not SSR"

That conclusion is too broad and would weaken the plugin's value proposition.

The better framing is:

- auth itself SSRs well
- some apps also need post-auth bootstrap
- the architectural question is where that bootstrap should live

---

## Goals

- Preserve SSR auth hydration as a first-class capability
- Clearly separate **auth resolution** from **app bootstrap**
- Give users practical guidance for choosing among bootstrap patterns
- Avoid overstating page-level SSR bootstrap as the default long-term architecture
- Position the plugin honestly for both small apps and larger systems

---

## Non-Goals

- This RFC does **not** propose disabling SSR for authenticated pages
- This RFC does **not** standardize a new runtime API yet
- This RFC does **not** require changing existing examples immediately
- This RFC does **not** prescribe a single app-specific user model

---

## Architectural Model

There are two distinct stages:

### 1. Auth Resolution

This is the plugin-level concern.

Inputs:

- session cookie
- Better Auth token exchange
- hydrated Convex token/user state

Outputs:

- "is the user authenticated?"
- "who is the user?"

This stage already works well with SSR.

### 2. App Bootstrap

This is the app-level concern.

Examples:

- ensure a local `users` row exists
- ensure a tenant context exists
- ensure permissions context has been derived
- ensure some domain-specific projection is available

Outputs:

- "is the app actor ready?"
- "can auth-scoped queries run safely?"

This stage is where tradeoffs appear.

---

## Options Considered

### Option A: Client Bootstrap After SSR Auth

**Flow**

1. SSR resolves auth
2. page hydrates authenticated state
3. client runs an app bootstrap mutation or action
4. authenticated queries subscribe after bootstrap completes

**Benefits**

- simplest application structure
- no extra Nitro routes
- easy to reason about in page code
- keeps app-specific logic in the app, not the runtime

**Costs**

- extra post-hydration roundtrip
- visible loading handoff before authenticated data appears
- multiple dependent queries all wait for the same client bootstrap

**Best fit**

- small apps
- examples
- situations where a short loading state is acceptable

**Assessment**

This is a valid baseline and should not be presented as broken. It is often the right first step.

---

### Option B: Page-Level SSR Bootstrap Through Nitro Route

**Flow**

1. SSR resolves auth
2. page makes an SSR-side call to a local Nitro route
3. Nitro route runs server-side Convex bootstrap logic
4. page starts authenticated queries with bootstrap already satisfied

**Benefits**

- removes the extra client bootstrap roundtrip
- lets multiple authenticated queries start from a ready actor on first load
- useful for proving or teaching the server-first path

**Costs**

- introduces page-level orchestration
- may require one-off bootstrap routes
- scales poorly if many pages need different prerequisites
- can drift toward ad hoc server glue

**Best fit**

- experiments
- narrow cases
- validating that server-first bootstrap improves UX

**Assessment**

This is a real pattern, not a fake one. It works fine for focused cases. It should not become the default recommendation for a large app.

---

### Option C: Deeper Provisioning in Auth or Shared Server Data Flow

**Flow**

1. authenticated state is resolved
2. provisioning of the app actor happens in a shared layer
3. server-rendered authenticated queries can assume the actor exists
4. page code does not own bootstrap orchestration

Possible implementations:

- make "authenticated" imply "app user row exists"
- run a shared server bootstrap hook once per request
- provision domain actor state during auth integration or shared server data loading

**Benefits**

- best long-term architecture
- fewer page-specific workarounds
- cleaner support for multiple dependent authenticated queries
- better separation between framework/runtime concerns and app page concerns

**Costs**

- deeper refactor
- requires careful API design if generalized in the plugin
- the runtime must avoid hardcoding app semantics

**Best fit**

- production apps
- multiple authenticated pages
- systems with tenant context, permission context, or several dependent auth-scoped queries

**Assessment**

This is the preferred long-term direction.

---

### Option D: Accept the Client-Only Handoff

This is effectively a stronger acceptance of Option A:

- do not optimize the bootstrap step
- show a loading state
- prefer lower implementation complexity over SSR completeness for app-scoped data

This is valid when:

- the extra delay is cheap
- the loading state is acceptable
- the app does not need deeper SSR guarantees yet

---

## Recommendation

### Positioning Recommendation

The plugin should be positioned as:

- **SSR-friendly even when auth is involved**
- strong at **SSR auth hydration**
- honest about **app bootstrap being the real design boundary**

The plugin should **not** be positioned as:

- "auth means you should disable SSR"

That would be a strategic mistake because SSR auth hydration is already one of the plugin's strengths.

### Product Message

Recommended message:

> Auth and SSR work well together. The harder question is where app-specific bootstrap belongs after auth is already known.

This preserves a strong value proposition while staying technically honest.

### Engineering Recommendation

Use the following guidance:

- **Default / simple path:** client bootstrap after SSR auth
- **Valid experiment / tactical optimization:** page-level SSR bootstrap through Nitro
- **Preferred long-term architecture:** move provisioning deeper into auth or shared server data flow

---

## Why "Auth Means No SSR" Is The Wrong Rule

That rule would collapse several different situations into one and produce worse guidance.

### Case 1: Auth-only branch selection

Examples:

- show signed-in vs signed-out UI
- redirect unauthenticated users
- preload authenticated shell state

SSR is a clear win here.

### Case 2: Auth plus directly readable authenticated data

Examples:

- "my profile"
- "my documents"
- "my notifications"

If the authenticated actor is already valid, SSR remains useful and should usually stay enabled.

### Case 3: Auth plus extra app bootstrap

Examples:

- local actor projection must exist first
- tenant context must be materialized
- permissions context must be derived

This is where tradeoffs begin, but the issue is the bootstrap dependency, not auth itself.

Therefore:

- do not disable SSR broadly
- instead, document and improve bootstrap placement

---

## Example 02 Findings

The experiment around Example 02 surfaced several concrete lessons.

### Findings

- SSR auth hydration worked correctly
- hydration mismatches came from differing bootstrap/query branches, not from auth itself
- client bootstrap is simple but introduces an extra handoff
- server-first bootstrap through Nitro worked and felt better for first signed-in render
- once several authenticated queries depend on the same bootstrap, the fan-out becomes obvious

### Interpretation

The server-route experiment is useful as documentation because it proves:

- a better first authenticated render is possible
- page-level SSR bootstrap is a legitimate tactical pattern
- the scaling problem comes from orchestration placement, not from SSR auth being fundamentally wrong

### Decision

Keep the experiment framed as an experiment, not as the canonical architecture.

---

## Runtime / API Implications

No immediate stable API change is required by this RFC.

However, future work may consider an extension point for shared server bootstrap.

Possible directions:

### 1. Shared Server Bootstrap Hook

Concept:

- a runtime hook that runs once per SSR request after auth resolution
- app can ensure its actor or projection there
- server queries can rely on the result

Pros:

- centralizes orchestration
- avoids page-level bootstrap routes

Risks:

- runtime must remain app-agnostic
- hook shape must be simple and predictable

### 2. Stronger Auth-to-App Provisioning Contract

Concept:

- application guarantees that auth lifecycle and local actor lifecycle are synchronized tightly enough that authenticated queries can assume readiness

Pros:

- most efficient end-state

Risks:

- app semantics differ too much to bake in casually

---

## Documentation Recommendations

### Example Positioning

Examples should communicate:

- Example 01: SSR query, no auth
- Example 02: auth plus bootstrap tradeoff

Example 02 should teach:

- auth and SSR are compatible
- query gating exists because app bootstrap is separate from auth
- there are multiple valid bootstrap placements
- the deeper architectural recommendation is preferred for scale

### Docs Language

Recommended phrasing:

- "SSR auth hydration"
- "app bootstrap after auth"
- "authenticated actor readiness"
- "bootstrap placement tradeoff"

Avoid phrasing such as:

- "auth pages should not SSR"
- "SSR breaks with auth"

---

## Open Questions

These are real design questions, not blockers for the RFC position.

1. Should the plugin eventually expose a shared server bootstrap hook for app actor provisioning?
2. If yes, should it be request-scoped only, or also reusable by server helpers like `serverConvexQuery()`?
3. How should the runtime remain app-agnostic while still helping with the common "ensure local actor" case?
4. Should any future runtime hook be documented as advanced/optional rather than a default path?

---

## Final Recommendation

Adopt the following stance for `better-convex-nuxt`:

1. **Keep SSR auth hydration as a core feature and selling point.**
2. **Do not treat auth as a reason to disable SSR.**
3. **Frame post-auth user/app bootstrap as the real architectural tradeoff.**
4. **Treat page-level SSR bootstrap as a valid tactical pattern, not the default scalable architecture.**
5. **Prefer a future shared server provisioning layer over accumulating page-level bootstrap routes.**

In short:

> Auth is not the problem. Bootstrap placement is the problem.

