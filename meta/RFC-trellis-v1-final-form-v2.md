# RFC: Trellis v1 Final Form v2

Status: Proposed
Date: 2026-04-20
Audience: Trellis maintainers and early adopters
Supersedes: [meta/RFC-trellis-v1-final-form.md](/Users/matthias/Git/0_libs/WORK/trellis/meta/RFC-trellis-v1-final-form.md:1)
Execution checklist: [meta/WORK-trellis-v1-execution-checklist.md](/Users/matthias/Git/0_libs/WORK/trellis/meta/WORK-trellis-v1-execution-checklist.md:1)

## Summary

Trellis should make one final pre-release hard cut before v1.

This RFC keeps the same direction as v1 Final Form, but tightens the parts that were still too broad:

- the architecture target is now paired with a proof gate
- runtime-neutral contracts have one explicit home
- tenant isolation is derived explicitly at build time, not by runtime field magic
- unsafe surfaces are reduced to two distinct public escape hatches
- trusted-forwarding hardening is required for v1; key rotation is not
- feature composition outputs are named concretely
- release gates are mechanical, not aspirational

This document is therefore both:

- the final v1 direction-setting RFC for Trellis as a product
- the architecture-ratification RFC for the new public app shape

All decisions here are locked now except one:

- whether `features/*` is promoted as the public generated shape for v1

That promotion is ratified only after the proof gate defined below.

## Why This RFC Exists

Trellis is still greenfield. There are no public users to migrate. That makes this the right moment to choose the final client-facing shape instead of shipping a v1 that already carries avoidable structural debt.

The repo today has two realities:

- the runtime already has a coherent protected model and real safety machinery
- the public product surface still teaches an older, more scattered contract through docs, generators, and examples

Examples:

- canonical layout is still documented as lane-first in [README.md](/Users/matthias/Git/0_libs/WORK/trellis/README.md:37) and [apps/docs/content/docs/01.getting-started/5.canonical-app-layout.md](/Users/matthias/Git/0_libs/WORK/trellis/apps/docs/content/docs/01.getting-started/5.canonical-app-layout.md:16)
- generators still scaffold `convex/auth|domain|operations|permissions` plus `shared/schemas` in [src/cli/lib/init.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/cli/lib/init.ts:70)
- tenant/schema analysis already exists in [src/analysis/project.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/analysis/project.ts:174) and [src/analysis/validation.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/analysis/validation.ts:37)
- the protected handler pipeline is already coherent in [src/runtime/functions/define-handler.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/functions/define-handler.ts:301)

The job of this RFC is to turn those into one v1 contract.

## Goals

- Eliminate silent tenant-isolation omissions.
- Make trusted forwarding production-grade.
- Make unsafe access explicit, typed, and auditable.
- Choose one canonical app shape that reduces cognitive load.
- Reduce drift across docs, examples, CLI templates, and runtime.
- Keep the runtime model explicit instead of burying it under a large DSL.
- Make Trellis teachable from simple to advanced without skipping levels.

## Non-Goals

- Preserve backward compatibility with the current pre-v1 shape.
- Support two parallel app shapes indefinitely.
- Introduce a mega application DSL that hides handlers, schema, and transports.
- Hide transport boundaries like webhooks, HTTP routes, or component bridges behind magic.
- Ship every possible DX improvement before v1.

## Decision Principles

1. Safe by default beats documented caution.
2. One explicit model beats dual paths.
3. Layout should reduce cognitive load, not create framework ceremony.
4. Derive once when the source of truth is real and stable.
5. Public framework APIs should stay smaller than the client apps they help build.
6. v1 should ship the strongest coherent contract, not the least disruptive one.

## Ground Truth

These points are treated as established:

- `trellis doctor` already exists in [src/cli/commands/doctor.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/cli/commands/doctor.ts:1)
- tenant and schema analysis already exist in [src/analysis/project.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/analysis/project.ts:1) and [src/analysis/validation.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/analysis/validation.ts:1)
- the ESLint plugin already exists in [src/eslint/index.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/eslint/index.ts:1)
- `defineArgs` already exists; it is underused rather than missing
- Convex pins specific root files like `schema.ts`, `auth.config.ts`, `http.ts`, `crons.ts`, and `convex.config.ts`
- the current `crossTenant` story still requires casts in examples, which is not acceptable for v1

## High-Level Options Considered

### Option A: Keep The Current Lane-First Contract

Public app shape remains fundamentally:

- `convex/auth`
- `convex/domain`
- `convex/operations`
- `convex/permissions`
- `shared/schemas`

Why it was attractive:

- smallest delta from the current product surface
- least disruption to docs and generators

Why it was rejected:

- preserves the core feature-scattering problem
- preserves `shared/schemas` duplication
- keeps too much manual aggregation and cross-folder hopping in the client authoring experience

### Option B: Full Feature-Root Rewrite With Large Framework DSL

Move everything into `features/*` with `_shell/*` and broad feature declarations driving the app.

Why it was attractive:

- strongest co-location
- biggest reduction in hand-maintained composition

Why it was rejected:

- overbuilds the framework
- adds ceremony that Convex root constraints do not justify
- risks replacing one complexity problem with another

### Option C: Hybrid Vertical Final Form

Keep true app shell entrypoints at the root, move app code into `features/*`, and add only thin composition helpers.

Why it was attractive:

- aligns with Convex constraints
- reduces feature scattering
- keeps runtime boundaries explicit
- solves the real drift points without inventing a new hidden model

Decision:

Accepted.

This RFC chooses Option C.

## Final Decisions

## 1. Canonical App Architecture

### Problem

The current public contract teaches a lane-first app layout as load-bearing. That layout made initial scaffolding straightforward, but it spreads one feature across too many places and raises the mental cost of ordinary feature work.

### Alternatives Considered

#### A. Keep lane-first as the final v1 contract

Rejected because it locks the current scattering problem into the public product.

#### B. Promote `features/*` immediately as the unconditional v1 public contract

Rejected in this unqualified form because the current CLI, docs, and resource generator do not yet prove it.

#### C. Adopt `features/*` as the target v1 contract, but only promote it after proof

Accepted.

### Decision

The v1 direction is root shell plus feature folders.

That direction is locked now.

The public generated/documented app shape is ratified only after a proof gate succeeds on:

- `examples/03-team-workspace`
- the corresponding `trellis init` scaffold

Until that checkpoint, this RFC decides the direction and the proof process, but not yet the promoted public scaffold contract.

The ratification checkpoint happens:

- after example 03 and the matching CLI scaffold are implemented
- before example 04 is rewritten

At that checkpoint, maintainers do exactly one of two things:

1. ratify `features/*` as the v1 public contract and continue
2. formally lock v1 to "vertical within stable lanes" and amend this RFC before continuing

### Target Shape

```text
nuxt.config.ts
convex/
  auth.ts
  auth.config.ts
  convex.config.ts
  functions.ts
  http.ts
  schema.ts
  auth/
    principal.ts
    actor.ts
    guards.ts
  permissions/
    index.ts
    context.ts
  features/
    tasks/
      schema.ts
      permissions.ts
      checks.ts
      capabilities.ts
      domain.ts
      operations.ts
      webhooks.ts
      tests.ts
      feature.ts
      index.ts
shared/
  features/
    tasks/
      contract.ts
app/
  features/
    tasks/
server/
  api/
  mcp/
    runtime.ts
    tools/
pages/
```

### Clarifications

- The shell is the Convex root plus any shell-owned subfolders such as `convex/auth/` and `convex/permissions/`.
- The shell is simply everything not under `features/*`.
- `_shell/` is not introduced.
- `pages/` remain route shells; substantial UI moves into `app/features/*`.

### Why This Wins

- It keeps true app singletons visible.
- It lowers feature cognitive load.
- It avoids `_shell/` ceremony.
- It prevents us from promoting a new public contract before it has been proven in the repo.

## 2. Runtime-Neutral Contract Location

### Problem

The first RFC version said `contract.ts` lived under `convex/features/*` while also saying contracts should be runtime-neutral and `shared/schemas/*` should disappear. That is internally inconsistent.

### Alternatives Considered

#### A. Put `contract.ts` under `convex/features/*`

Rejected because browser-consumable contract sources should not implicitly live under `convex/`.

#### B. Keep `shared/schemas/*`

Rejected because it preserves the wrong shape and the current duplication story.

#### C. Move runtime-neutral contracts to `shared/features/*`

Accepted.

### Decision

Runtime-neutral feature contracts live at:

- `shared/features/<name>/contract.ts`

That file is the contract source of truth and is authored once through `defineArgs`.

Feature-specific server code lives at:

- `convex/features/<name>/*`

UI code lives at:

- `app/features/<name>/*`

### Why This Wins

- It gives contracts one explicit home.
- It removes the internal contradiction from the earlier RFC.
- It preserves real runtime neutrality.

## 3. Feature Composition Surface

### Problem

Moving files alone does not eliminate drift if schema, tenant metadata, and permission inventories still need to be hand-kept in sync.

### Alternatives Considered

#### A. Manual imports and barrels only

Rejected because it leaves the main composition drift points in place.

#### B. Large feature DSL

Rejected because it overbuilds the framework and hides too much runtime detail.

#### C. Thin composition helpers

Accepted.

### Decision

Trellis adds thin `defineFeature(...)` and `composeFeatures(...)` helpers.

They are aggregation helpers, not authoring primitives.

`composeFeatures(...)` returns a `FeatureManifest`; generated composition files may destructure its outputs for local use.

`composeFeatures(...)` must concretely provide:

- `manifest.schema`
- `manifest.permissions`
- `manifest.tenantTables`
- `manifest.globalTables`

Those outputs feed:

- `manifest.schema` -> exported schema from `convex/schema.ts`
- `manifest.permissions` -> permission-context aggregation in `convex/permissions/context.ts`
- `manifest.tenantTables` -> `defineTrellis(...)` tenant-isolation configuration
- `manifest.globalTables` -> explicit tenant-isolation exceptions consumed by `defineTrellis(...)`

### Why This Wins

- It collapses the three main drift points without replacing explicit handler authoring.
- It gives features a real reason to exist beyond folder preference.

## 4. Protected Handler Pipeline

### Problem

New users struggle with the distinction between `guard`, `load`, `authorize`, and `handler`.

### Alternatives Considered

#### A. Keep the model and syntax exactly as-is

Rejected because the model is right but the ergonomics still have avoidable ceremony.

#### B. Collapse `guard` and `authorize`

Rejected because it weakens an important runtime distinction.

#### C. Keep the model and simplify its common form

Accepted.

### Decision

Trellis keeps:

1. `guard`
2. `load`
3. `authorize`
4. `handler`

Trellis tightens the public contract by supporting these `authorize` forms:

```ts
authorize: canUpdateTodo
authorize: (_actor, loaded) => canUpdateTodo(loaded.todo)
authorize: {
  check: (_actor, loaded) => canUpdateTodo(loaded.todo)
}
```

Trellis adds:

- lint rules rejecting DB access or record loading inside `guard`
- clearer docs and examples around when each phase is used

### Why This Wins

- It preserves the correct runtime model.
- It removes the main source of ceremony without flattening the model.

## 5. Tenant Isolation Model

### Problem

The current `tenantIsolation.tables` list is a silent omission risk.

The earlier RFC chose runtime field-based auto-isolation from `workspaceId`. Review feedback was right to push back on that exact shape: for v1, that is too magical as a runtime contract.

### Alternatives Considered

#### A. Keep hand-maintained explicit table lists

Rejected because it preserves the dangerous omission footgun.

#### B. Runtime field introspection from `workspaceId`

Rejected for v1 because it makes too much of the runtime contract implicit.

#### C. Build-time derived exhaustive classification

Accepted.

### Decision

Tenant isolation becomes explicitly derived at build time from the canonical app composition.

The v1 contract is:

- every tenant-scoped table must be classified
- classification is derived from composed schema analysis
- feature metadata provides overrides and exceptions only, especially `globalTables`
- runtime consumes the explicit derived set
- `doctor`, ESLint, and generators consume the same derived manifest classification

Conceptually:

```ts
const manifest = composeFeatures([...])

defineTrellis(..., {
  tenantIsolation: {
    tables: manifest.tenantTables,
    globalTables: manifest.globalTables,
  },
})
```

### Why This Wins

- It eliminates omission risk.
- It avoids runtime magic as the v1 contract.
- It preserves an explicit, inspectable classification model.

## 6. Unsafe Access Surfaces

### Problem

Current unsafe surfaces are too neutral and too inconsistent.

The first RFC version also overcomplicated the taxonomy by implying too many unsafe levels.

### Alternatives Considered

#### A. Keep `raw` and `crossTenant`

Rejected because neutral names weaken review and audit quality.

#### B. Rename every unsafe thing to one shared `unsafe` vocabulary

Rejected because builder-level pipeline bypass and DB-level tenant bypass are different semantics and should remain distinguishable.

#### C. Keep two distinct public unsafe surfaces with explicit reasons

Accepted.

### Decision

Trellis v1 exposes exactly two distinct public unsafe escape hatches:

1. Builder-level pipeline bypass:

```ts
unsafe.query(...)
unsafe.mutation(...)
```

2. DB-level tenant escape inside an otherwise normal protected path:

```ts
ctx.db.escapeTenantIsolation({ reason: '...' })
```

Rules:

- `unsafe.query(...)` and `unsafe.mutation(...)` require a definition-time justification such as `bypass: '<reason>'`
- `ctx.db.escapeTenantIsolation({ reason })` requires a non-empty inline `reason`
- both are audited
- neither should require casts in user code
- there is no third public DB-level full-bypass API in v1 unless a concrete need is proven during implementation

### Why This Wins

- It preserves a clear semantic distinction.
- It avoids multiplying unsafe surfaces unnecessarily.
- It gives auditors and reviewers two meaningful grep targets.

## 7. Trusted Forwarding

### Problem

Trusted forwarding is already fail-closed in the core verification path, but v1 still needs stronger production hardening.

### Alternatives Considered

#### A. Keep the current shared-secret model with basic presence checks only

Rejected because that is not a sufficient v1 posture.

#### B. Add weak-key rejection, docs, and `doctor` checks

Accepted as required v1 scope.

#### C. Require key rotation support in v1

Rejected as a hard requirement. It may ship if it lands cheaply, but it is not required for v1 sign-off.

### Decision

Required v1 scope:

- weak/dev-like trusted-forwarding keys are rejected at runtime in production
- docs explain the risk and rotation procedure
- `doctor` checks for obvious misuse or leakage

Optional if cheap:

- `current` / `previous` key support

### Why This Wins

- It upgrades the safety posture without widening v1 scope unnecessarily.
- It keeps runtime enforcement in scope, not just docs or diagnostics.

## 8. Server Identity Story

### Problem

The examples currently teach more than one server identity pattern.

### Alternatives Considered

#### A. Keep multiple public patterns

Rejected because Trellis needs one canonical story.

#### B. Introduce first-class service accounts for v1

Rejected because it is meaningful extra framework scope.

#### C. Hard-cut the public story to trusted forwarding plus delegation

Accepted.

### Decision

Trellis v1 teaches one canonical server identity story:

- trusted forwarding for verified server callers
- optional delegation when a caller acts on behalf of a user

The webhook-bot user pattern is removed from the learning path.

### Why This Wins

- It aligns examples with the stronger runtime model.
- It prevents two public stories from competing.

## 9. Actor Bootstrap

### Problem

There is real pain around "auth identity exists but app user row does not."

### Alternatives Considered

#### A. Bootstrap during `ctx.actor()` reads

Rejected because read-time mutation is surprising and weakens trust in actor resolution.

#### B. Keep bootstrap fully manual and app-owned

Rejected because it is too easy to wire inconsistently.

#### C. Make bootstrap framework-owned at the auth integration boundary

Accepted.

### Decision

Trellis should not mutate on `ctx.actor()` reads.

Instead:

- starters and auth integration provide framework-owned bootstrap wiring
- bootstrap failures fail loudly
- app authors get one consistent bootstrap story

### Why This Wins

- It keeps identity resolution predictable.
- It solves the integration pain without surprising reads.

## 9.1 Canonical Subject Builders

### Problem

Even with the principal / delegation / actor model in place, canonical subjects can still be too stringly if callers keep hand-writing values like `user:${authId}` and `service:${serviceId}` at each call site.

The runtime already validates and parses canonical subjects. Construction should be just as consistent.

### Alternatives Considered

#### A. Keep string interpolation at call sites

Rejected because it leaves a real footgun in exactly the identity model Trellis is trying to make safer.

#### B. Add heavyweight principal factories for every caller shape

Rejected because that adds too much surface for too little gain.

#### C. Add small canonical subject builders

Accepted.

### Decision

Trellis exposes canonical subject builders in the auth surface:

- `subject.user(id)`
- `subject.agent(id)`
- `subject.service(id)`
- `subject.webhook(id)`
- `subject.system(id)`
- `subject.anonymous()`

and the lower-level `createSubject(kind, value)`.

The library should use these builders in its own runtime and examples anywhere canonical subjects are constructed programmatically.

### Why This Wins

- It closes a real string-literal footgun without changing the identity model.
- It complements the existing subject parsing helpers with an equally small construction surface.
- It keeps the fix additive and low-risk instead of reopening the auth design.

## 10. Starter Ladder And Teaching Path

### Problem

The product currently teaches a `public` lane in docs without a matching official starter, and `personal` over-teaches permissions too early.

### Alternatives Considered

#### A. Keep the current starter set and clarify docs only

Rejected because the mismatch is itself a product bug.

#### B. Stop teaching `public`

Rejected because Trellis wants a simple top-of-funnel starting point.

#### C. Add a real `public` starter and simplify `personal`

Accepted.

### Decision

Official starter ladder becomes:

1. `public`
2. `personal`
3. `workspace`
4. `cms`

`public` scaffolds the zero-auth, live-query baseline app: no auth wiring, no permission context, one minimal feature contract and corresponding Convex/UI flow.

Examples 04 to 08 become pattern and stress-test branches, not the top-of-funnel contract.

`personal` stops scaffolding the full permission-context story by default.

### Why This Wins

- It aligns product and docs.
- It stages complexity better.

## 11. Vocabulary

### Problem

The current vocabulary has some overloaded or misleading terms.

### Alternatives Considered

#### A. Full vocabulary rewrite

Rejected because it is too much churn for too little gain.

#### B. Keep all current terms

Rejected because terms like `raw` are actively harmful.

#### C. Keep stable core nouns and fix only the overloaded ones

Accepted.

### Decision

Core nouns kept:

- principal
- actor
- guard
- permission
- capability
- operation

Changed:

- public `raw` terminology is removed
- CLI `add resource` becomes `add entity`

### Why This Wins

- It fixes the dangerous confusion without paying for a full vocabulary migration.

## 12. Shell And Boundary Rules

### Problem

The shell-vs-feature boundary needs to be explicit or the manifest contract will drift immediately after adoption.

### Decision

Boundary rules for v1:

- shell may not import feature internals
- features may import shell primitives
- features may not deep-import each other; cross-feature access goes through `features/<name>/index.ts`
- tests inside a feature may reach into that feature freely

Concrete examples:

- `convex/auth/guards.ts` holds shared shell primitives like `hasRole` and `hasWorkspace`
- `convex/features/<name>/checks.ts` holds feature-local record-bound checks like `canUpdateTodo`

### Why This Wins

- It makes the shell-vs-feature line enforceable rather than aspirational.

## 13. `shared/features/*` And `app/features/*`

### Problem

The first RFC introduced both folders without defining them.

### Decision

- `shared/features/<name>/` exists only for runtime-neutral contract artifacts
- every feature has a contract, and that contract always lives at `shared/features/<name>/contract.ts`
- `shared/features/*` is not a general-purpose shared folder
- `shared/features/*` must not import Vue, Nuxt, or Convex server modules
- `app/features/<name>/` contains Vue components, composables, and page fragments
- the default scaffolded shared file is only `contract.ts` unless another runtime-neutral artifact is explicitly proven necessary

### Why This Wins

- It keeps `shared/` narrow and intentional.
- It prevents it from becoming a second dumping ground.

## 14. Component Boundaries

### Problem

Example 08 introduces a real host/component boundary that the earlier RFC did not spell out.

### Decision

Components are mini-Trellis boundaries.

Inside a component boundary, the same shell + features layout applies:

- component shell at the component root
- component features under the component's `features/*`

### Why This Wins

- It keeps the architectural rule consistent across the hardest boundary Trellis supports.

## 15. `trellis doctor` And ESLint Scope

### Problem

The repo already knows more about safe usage than the shipped tooling currently enforces, but that knowledge needs to line up with the manifest contract Trellis teaches publicly.

### Alternatives Considered

#### A. Leave `doctor` narrow and rely on docs

Rejected because Trellis already has the analysis machinery.

#### B. Build a large new diagnostics product for v1

Rejected because the current surfaces can cover most of the value.

#### C. Extend the existing `doctor` and ESLint surfaces

Accepted.

### Decision

For v1, `doctor` and ESLint cover:

- tenant classification completeness
- destructive-safety schema requirements
- unsafe access justification
- trusted-forwarding misuse and obvious leakage paths
- guard misuse
- feature-manifest drift
- boundary import violations

Deferred:

- secret-history scanning
- deep bundle scanning beyond high-value checks
- fixture DSLs and testing matchers
- `trellis trace`

### Why This Wins

- It captures the highest-value enforcement with tooling Trellis already ships.
- It keeps v1 scope disciplined.

## 16. Testing Ergonomics

### Problem

Testing ergonomics came up in the audit but was not addressed explicitly in the first RFC.

### Decision

Trellis v1 keeps the current testing model:

- `createTestContext`
- current seed helpers
- example-specific setup

Deferred post-v1:

- fixture builders
- permission snapshot matchers

### Why This Wins

- Testing ergonomics are not the highest-risk v1 problem.
- Explicitly saying "not now" is better than leaving the topic vague.

## Rollout Order

This work lands serially.

1. Safety primitives and unsafe-surface hard cut.
2. `doctor` and ESLint enforcement needed to hold the new contract in place.
3. Thin feature composition helpers.
4. Prove the architecture in `examples/03-team-workspace` and the matching CLI scaffold.
5. Promote the architecture to the public docs and generators if the proof gate passes.
6. Rewrite example 04.
7. Rewrite examples 07 and 08.
8. Rewrite the remaining examples and docs.

## Proof Gate

The `features/*` architecture is promoted to the public contract only if all of the following are true after step 4:

- example 03 works cleanly under the target shape
- the corresponding CLI scaffold generates the same shape
- no casts are required for unsafe access
- the new boundary rules hold without ad-hoc disables

The decision is made once, at the ratification checkpoint defined in section 1.

If the checkpoint fails, Trellis falls back to "vertical within stable lanes" for v1 rather than shipping a half-proven public contract.

## Release Gates

Trellis is considered v1-ready on this RFC only when all of the following are true:

- `trellis init` output matches the documented canonical layout
- every repo-owned public example and generated scaffold path passes the new ESLint preset with zero disables
- no public example uses casts for unsafe DB access
- no public example teaches the webhook-bot path as canonical
- generated output no longer includes `shared/schemas/*`
- `doctor` fails on tenant-classification drift and destructive-safety drift

Verification bar:

```bash
pnpm run check
pnpm run test:contracts
pnpm run test:examples
pnpm run test:types
```

## Explicitly Deferred

These were considered but are not required for v1:

- large feature authoring DSLs
- `_shell/` root convention
- keeping the lane-first contract as the final public shape
- collapsing `guard` and `authorize`
- read-time actor mutation
- first-class service-account model
- trusted-forwarding key rotation as a required feature
- `trellis trace`
- fixture builders and testing matchers

## Final v1 Contract

If accepted, Trellis v1 means:

- root shell plus feature folders if ratified at the proof checkpoint; otherwise the explicitly chosen fallback is "vertical within stable lanes"
- runtime-neutral contracts in `shared/features/*`
- build-time derived tenant classification
- two explicit unsafe escape hatches with audit visibility
- trusted-forwarding hardening as required v1 scope
- one canonical server identity story
- one progressive starter ladder
- one consistent story across runtime, CLI, docs, generators, and examples

## Consequences

This RFC still chooses a strong direction.

That means:

- Trellis breaks from its current pre-v1 generated shape
- several examples and docs require full rewrites
- CLI and `doctor` become part of the contract, not adjacent helpers
- the framework keeps its explicit runtime model while dramatically improving the client authoring experience

That is the right trade for v1.
