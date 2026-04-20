# RFC: Trellis v1 Final Form

Status: Proposed
Date: 2026-04-20
Audience: Trellis maintainers and early adopters

## Summary

Trellis should make one final pre-release hard cut before v1.

The final form should be:

- safe-by-default on tenant isolation and trusted forwarding
- explicit and auditable on unsafe access
- vertically organized for app code
- simple at the framework core
- consistent across runtime, CLI, docs, examples, and generators

This RFC combines:

- the DX and safety audit
- the vertical architecture proposal
- the Convex path-constraints research
- three alternative implementation plans
- direct inspection of the current repository

It is intentionally not a menu. For each major decision, this RFC records:

- the problem
- the alternatives considered
- the decision
- why that decision wins
- what is explicitly deferred

## Why This RFC Exists

Trellis is still greenfield. There are no public users to migrate. That means this is the last cheap chance to choose the final client-facing shape instead of slowly accreting exceptions.

Today the repo has a split personality:

- the runtime already contains solid primitives and safety machinery
- the shipped app shape, CLI templates, docs, and examples still teach an older, more scattered contract

Examples:

- the canonical layout is still documented as lane-first in [README.md](/Users/matthias/Git/0_libs/WORK/trellis/README.md:37) and [apps/docs/content/docs/01.getting-started/5.canonical-app-layout.md](/Users/matthias/Git/0_libs/WORK/trellis/apps/docs/content/docs/01.getting-started/5.canonical-app-layout.md:16)
- the CLI generators still scaffold `convex/auth|domain|operations|permissions` plus `shared/schemas` in [src/cli/lib/init.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/cli/lib/init.ts:70)
- runtime tenant and schema analysis already exists in [src/analysis/project.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/analysis/project.ts:174) and [src/analysis/validation.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/analysis/validation.ts:37)
- the protected handler phase model is already coherent in [src/runtime/functions/define-handler.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/functions/define-handler.ts:301)

The goal of this RFC is to collapse those into one product contract that Trellis can ship as v1.

## Inputs Considered

This RFC combines and reconciles five input streams:

1. The DX and safety audit, especially the tenant-isolation, trusted-forwarding, and escape-hatch findings.
2. The vertical architecture proposal arguing for feature-first co-location.
3. The Convex path-constraints research showing which files are truly pinned at the root and which are flexible.
4. Three alternative implementation plans.
5. Direct repository inspection of runtime, CLI, ESLint, docs, and examples.

## Ground Truth Established During Review

Several claims in the input documents were directionally useful but technically incomplete.

These points are treated as established for this RFC:

- `trellis doctor` already exists in [src/cli/commands/doctor.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/cli/commands/doctor.ts:1). The question is how far to extend it, not whether to invent it.
- schema and tenant analysis already exist in [src/analysis/project.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/analysis/project.ts:1) and [src/analysis/validation.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/analysis/validation.ts:1)
- the ESLint plugin already exists in [src/eslint/index.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/eslint/index.ts:1) with multiple rule groups already shipped
- `defineArgs` already exists in the runtime; the problem is underuse, not absence
- the current protected runtime model is not the weak point; the weak point is drift between runtime, CLI, docs, and examples
- Convex pins specific root paths like `schema.ts`, `auth.config.ts`, `http.ts`, `crons.ts`, and `convex.config.ts`; everything else can be organized more freely
- the current `crossTenant` story still requires casts in real examples, which is not acceptable for a v1 public contract

## Goals

- Eliminate silent tenant-isolation omissions.
- Make trusted forwarding production-grade.
- Make unsafe access explicit, typed, and auditable.
- Choose one canonical app shape that reduces cognitive load.
- Reduce drift across docs, examples, CLI templates, and runtime.
- Keep the runtime model explicit instead of burying it under a large DSL.
- Make Trellis easier to teach in a progressive path from simple to advanced.

## Non-Goals

- Preserve backward compatibility with the current pre-v1 shape.
- Support two parallel app shapes.
- Introduce a mega application DSL that authors handlers, schema, and transports in one block.
- Hide transport boundaries like webhooks, HTTP routes, or component bridges behind magic.
- Ship every possible DX enhancement before v1.

## Decision Principles

These principles were used to choose between alternatives:

1. Safe by default beats documented caution.
2. One explicit model beats dual paths.
3. Layout should reduce cognitive load, not create framework ceremony.
4. Prefer deriving information once over hand-maintaining the same list in many places.
5. Framework additions must pay for themselves in reduced drift or reduced user error.
6. Trellis should optimize for the client authoring experience, not internal maintainers' familiarity with the current repo shape.

## Options Considered At The Highest Level

Three top-level directions emerged from the competing plans.

### Option A: Keep The Current Lane-First Shape

Canonical app contract remains:

- `convex/auth`
- `convex/domain`
- `convex/operations`
- `convex/permissions`
- `shared/schemas`

Advantages:

- smallest conceptual change from today
- minimal disruption to docs and generators
- avoids adding any new composition primitives

Problems:

- preserves the biggest source of feature scattering
- keeps `shared/schemas` duplication alive
- keeps more manual composition at the app root
- locks Trellis into a shape that already feels heavier than it should in examples 03 to 07

Verdict:

Rejected. This is the familiar path, but not the best v1 path.

### Option B: Full Feature-Root Vertical Rewrite With New Framework DSL

Everything non-generated moves under `features/*`, with `_shell/*` and new framework composition primitives doing most assembly.

Advantages:

- strongest co-location
- easiest story for "change one thing, open one folder"
- removes several hand-maintained composition points

Problems:

- overreaches into framework ceremony
- fights Convex's actual root-file constraints
- risks inventing a second abstraction problem while trying to solve the first
- creates too much new framework surface at once

Verdict:

Rejected in this strongest form. The co-location instinct is right, the `_shell` and large-DSL direction is not.

### Option C: Hybrid Vertical Final Form

Keep true app shell files at the root because Convex and Trellis genuinely have app-level entrypoints, but move business code into feature folders with light composition helpers.

Advantages:

- aligns with Convex constraints
- reduces feature scattering
- keeps the runtime model explicit
- lets Trellis derive and compose the few things that currently drift

Problems:

- still requires a deliberate contract rewrite across docs, CLI, and examples
- needs a thin new composition layer or equivalent aggregation convention

Verdict:

Accepted.

This RFC chooses Option C.

## Final Decisions

## 1. Canonical App Architecture

### Problem

The current public contract teaches a lane-first file layout as load-bearing. That layout is easy to generate, but it spreads one feature across too many folders and teaches a structure Trellis itself no longer fully believes in.

### Alternatives Considered

#### A. Keep the lane-first layout as the final form

This was proposed in one of the plans.

Why it was attractive:

- minimal churn
- aligns with current docs and generators
- avoids new framework concepts

Why it was rejected:

- preserves the core feature-scattering problem
- keeps the biggest mental tax in place for client authors
- makes the v1 "final form" feel like a compromise preserved from earlier scaffolding rather than an intentional design

#### B. Move everything under `features/*` and add `_shell/*`

Why it was attractive:

- strongest feature co-location
- clear shell vs feature separation

Why it was rejected:

- `_shell` is ceremony, not value
- Convex already pins root files, so root-as-shell is simpler and more honest
- too much new structure for too little gain

#### C. Root shell plus feature folders

Why it was attractive:

- keeps true app singletons where they belong
- makes app code vertical
- preserves explicit runtime boundaries

Decision:

Accepted.

### Decision

The final v1 client-facing shape is:

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
      contract.ts
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
server/
  api/
  mcp/
    runtime.ts
    tools/
shared/
  features/
app/
  features/
pages/
```

Notes:

- The Convex root is the shell.
- `_shell/` is not introduced.
- `features/*` is the default home for business code.
- `server/mcp/runtime.ts` remains app-level shell, while individual tools may mirror feature structure.
- `pages/` stays as route shells; substantial UI moves into `app/features/*`.

### Why This Wins

- It keeps the parts that are truly app-level visible.
- It dramatically improves feature co-location.
- It avoids inventing more framework structure than necessary.
- It gives Trellis one clear story for generated apps and examples.

## 2. Feature Composition Primitive

### Problem

Moving files alone does not solve drift if app authors still have to manually keep schema composition, permission inventories, and tenant metadata in sync.

### Alternatives Considered

#### A. No composition primitive

Use barrel files and manual imports only.

Why it was attractive:

- smallest framework change
- least new API surface

Why it was rejected:

- leaves too much manual aggregation drift in place
- gives up one of the main benefits of moving to feature folders

#### B. Large feature DSL

A feature declaration becomes the main authoring surface for handlers, schema, permissions, and projections.

Why it was attractive:

- maximum derivation
- strongest convention enforcement

Why it was rejected:

- overbuilds the framework
- risks hiding too much runtime detail
- would be hard to stabilize before v1

#### C. Thin composition helpers

`defineFeature(...)` and `composeFeatures(...)` exist only to aggregate metadata and exports, not to replace handler authoring.

Decision:

Accepted.

### Decision

Trellis will add thin `defineFeature(...)` and `composeFeatures(...)` helpers.

They will:

- compose feature-owned schema blocks
- compose permission exports
- compose capability exports where useful
- derive tenant-isolated feature table metadata

They will not:

- replace `query(...)`, `mutation(...)`, `defineOperation(...)`, or handler authoring
- generate transport behavior by magic
- become a mega app DSL

### Why This Wins

- It solves real drift without replacing the runtime model.
- It keeps feature layout honest and useful.
- It gives CLI templates and examples a stable composition target.

## 3. Protected Handler Pipeline

### Problem

Some proposals argued for collapsing or rethinking `guard`, `load`, and `authorize` because new users struggle with the distinction.

### Alternatives Considered

#### A. Keep the model exactly as-is

Why it was attractive:

- simplest implementation story
- current runtime is already correct

Why it was not fully chosen:

- the model is sound, but the syntax still has unnecessary ceremony

#### B. Unify `guard` and `authorize`

Why it was attractive:

- fewer top-level concepts
- simpler mental story for beginners

Why it was rejected:

- collapses a useful distinction between coarse actor gate and record-bound authorization
- hides an important sequencing truth in the runtime
- weakens clarity for serious apps

#### C. Keep the model, simplify the ergonomics

Decision:

Accepted.

### Decision

Trellis keeps:

1. `guard`
2. `load`
3. `authorize`
4. `handler`

Trellis adds:

- an `authorize` shorthand for the common case
- lint rules that reject DB access or async-style record loading inside `guard`
- much clearer docs and examples around when each phase is used

### Why This Wins

- It preserves the right runtime model.
- It solves the real pain, which is misuse and teaching, not the model itself.

## 4. Tenant Isolation Model

### Problem

The current `tenantIsolation.tables` list is a silent omission risk. That is the most serious correctness and safety issue in the current contract.

### Alternatives Considered

#### A. Keep explicit manual table lists, but make them exhaustive

This was proposed as the safer explicit alternative to introspection.

Why it was attractive:

- zero hidden magic
- forces app authors to think about every table

Why it was rejected:

- still depends on humans remembering to update a list
- keeps the most dangerous drift vector in the public API
- makes the safe path slower than the unsafe omission path

#### B. Schema-derived safe-by-default isolation

Any table with `workspaceId: v.id('workspaces')` is tenant-isolated by default. App authors use an explicit exception list for global tables.

Why it was attractive:

- flips the default in the safe direction
- removes the omission footgun
- reuses information the framework already has

Why it was chosen:

- it is the best safety and DX tradeoff for v1

#### C. Docs and doctor only

Why it was rejected:

- weak compared to the risk

### Decision

Tenant isolation becomes schema-derived by default.

Conceptually:

```ts
tenantIsolation: {
  globalTables: ['workspaces', 'users']
}
```

Rules:

- any table with `workspaceId: v.id('workspaces')` is isolated by default
- global opt-out remains explicit
- runtime, doctor, CLI, and ESLint consume the same underlying analysis

### Why This Wins

- It removes the single most dangerous silent failure mode.
- It aligns with Trellis's stated safe-by-default posture.
- It makes adding a normal tenant table the easy path.

## 5. Unsafe Access Surfaces

### Problem

Current unsafe surfaces are too neutral and too inconsistent:

- builder-level `raw`
- DB-level `ctx.db.crossTenant`
- DB-level `ctx.db.raw`

They are observable, but still too easy to normalize.

### Alternatives Considered

#### A. Keep the names and document them better

Why it was rejected:

- naming is part of the safety surface
- neutral names undercut review quality

#### B. Rename everything to different scary names

Why it was attractive:

- strongest review signal

Why it was only partly chosen:

- the names still need to preserve a useful trust-level mental model

#### C. Keep the trust-level distinction, but make unsafe intent explicit

Decision:

Accepted.

### Decision

Trellis keeps three trust levels, but the unsafe ones become explicit:

- default DB: `ctx.db`
- tenant-bypass DB: `ctx.db.crossTenantUnsafe({ reason })`
- full-bypass DB: `ctx.db.unsafe({ reason })` or equivalent unsafe explicit surface
- builder-level `raw` becomes `unsafe`

Every unsafe path requires:

- a non-empty reason
- typed access without casts
- emitted observability with the reason attached

### Why This Wins

- It preserves the useful trust-level model.
- It makes every bypass visible in code review and logs.
- It removes cast-based examples from the public contract.

## 6. Trusted Forwarding

### Problem

Trusted forwarding is already fail-closed in core validation, but the production hardening story is incomplete.

### Alternatives Considered

#### A. Keep the current shared-secret model with presence checks only

Why it was rejected:

- not enough for a v1 security posture

#### B. Add boot-time hardening only

Why it was attractive:

- low implementation cost
- immediate production improvement

Why it was not enough:

- still leaves no clean rotation story

#### C. Add hardening plus simple key rotation support

Decision:

Accepted.

### Decision

Trusted forwarding gets:

- production rejection for weak or obviously dev-like values
- support for `current` plus `previous` keyring semantics
- stronger doctor checks for misuse or leakage
- canonical examples that use trusted forwarding instead of older bot-user patterns

### Why This Wins

- It upgrades a critical surface to v1-ready without redesigning the trust model.
- Rotation support is modest in scope and high in value.

## 7. Webhook And Service Identity Story

### Problem

The examples currently teach more than one server identity pattern, including a webhook-bot user pattern that is weaker and less coherent than trusted forwarding plus delegation.

### Alternatives Considered

#### A. Keep both patterns as valid public stories

Why it was attractive:

- minimizes example churn

Why it was rejected:

- two public stories means no clear canonical path
- weaker pattern stays alive because it already exists

#### B. Build first-class service accounts now

Why it was attractive:

- principled long-term model

Why it was rejected for v1:

- meaningful additional design space
- not required to solve the immediate public-story problem

#### C. Hard-cut the public story to trusted forwarding plus optional delegation

Decision:

Accepted.

### Decision

Trellis v1 will teach one canonical server identity story:

- trusted forwarding for verified server callers
- delegation where the caller acts on behalf of a user

The webhook-bot user pattern is removed from the learning path.

### Why This Wins

- It gives Trellis one identity story instead of competing examples.
- It aligns examples with the stronger runtime model already in place.

## 8. Argument And Schema Reuse

### Problem

The current use of `shared/schemas/*` duplicates validation and contract information that should be authored once.

### Alternatives Considered

#### A. Keep `shared/schemas/*`

Why it was attractive:

- familiar
- explicit browser/server boundary

Why it was rejected:

- duplicates information
- makes feature changes touch too many places
- weakens the case for feature co-location

#### B. Use `defineArgs` as the single source of truth

Generate Convex args, Zod, and metadata from one definition.

Decision:

Accepted.

### Decision

Trellis v1 will make `defineArgs` the default source of truth for feature contracts.

The feature `contract.ts` file becomes the home for:

- Convex validators
- Zod-derived client validation
- metadata used by MCP or docs

`shared/schemas/*` is removed from the generated v1 public contract.

### Why This Wins

- It removes real duplication.
- It strengthens feature co-location.
- It simplifies the starter and generator story.

## 9. Product Teaching Path

### Problem

The product currently teaches a `public` lane in docs without a matching official starter, and `personal` over-teaches permissions too early.

### Alternatives Considered

#### A. Keep the current starter set and just clarify docs

Why it was rejected:

- mismatch between docs and product is itself a product bug

#### B. Stop teaching `public`

Why it was attractive:

- smallest change

Why it was rejected:

- Trellis clearly wants a simple public-first learning path
- removing it narrows the funnel unnecessarily

#### C. Add a real `public` starter and simplify `personal`

Decision:

Accepted.

### Decision

Official starters become:

- `public`
- `personal`
- `workspace`
- `cms`

Teaching path:

1. `public`
2. `personal`
3. `workspace`
4. branch into `04`, `05`, `06`, `07`, `08`

`personal` stops scaffolding the full permission-context story by default.

### Why This Wins

- It aligns product and docs.
- It stages complexity better.
- It makes Trellis easier to teach without dumbing down the serious model.

## 10. Policy Vocabulary

### Problem

The current vocabulary around guards, checks, permissions, capabilities, resources, and unsafe access is more fragmented than it should be.

### Alternatives Considered

#### A. Full vocabulary rewrite

Rename guard to rule, checks to rules, permissions to something else, etc.

Why it was attractive:

- might produce a cleaner abstract system

Why it was rejected:

- too much churn
- not necessary if the main terms are clarified and overloaded ones fixed

#### B. Keep all terms as-is

Why it was rejected:

- some terms are actively harmful, especially `raw`
- `resource` is too overloaded for the CLI and docs

#### C. Keep stable core nouns, fix the overloaded ones

Decision:

Accepted.

### Decision

Core nouns kept:

- principal
- actor
- guard
- permission
- capability
- operation

Terms changed or narrowed:

- `raw` is removed from the public product story
- CLI `add resource` is renamed to `add model` or `add entity`
- `resource` as a vague umbrella term is reduced in public docs where possible

### Why This Wins

- It fixes the harmful confusion without paying the cost of a full vocabulary migration.

## 11. Observability And Audit Visibility

### Problem

Delegation and unsafe access are real runtime concepts, but they are not visible enough in logs, audit rows, or developer debugging surfaces.

### Alternatives Considered

#### A. Leave observability mostly as-is

Why it was rejected:

- undercuts one of Trellis's strongest architectural claims

#### B. Add richer identity and unsafe-access context everywhere it matters

Decision:

Accepted.

### Decision

Audit and observability surfaces will include:

- principal subject or principal kind
- delegation subject when present
- resolved actor identity where safe to include
- tenant context
- unsafe-access reason

Denials split developer detail from user-facing messages.

### Why This Wins

- It makes advanced concepts concrete in practice.
- It improves incident debugging and operator trust.

## 12. Actor Bootstrap

### Problem

There is real pain around "auth identity exists but app user row does not."

### Alternatives Considered

#### A. Bootstrap on `ctx.actor()` reads

Why it was attractive:

- convenient
- hides the inconsistency from users

Why it was rejected:

- surprising side effects during reads
- weakens trust in `actor()` as a read-only identity resolution step

#### B. Keep manual bootstrap entirely user-authored

Why it was attractive:

- simplest framework behavior

Why it was rejected:

- too easy to wire inconsistently across starters and examples

#### C. Make bootstrap a framework-owned startup/auth integration concern

Decision:

Accepted.

### Decision

Trellis should not mutate on `ctx.actor()` reads.

Instead:

- starters and auth integration provide framework-owned bootstrap wiring
- bootstrap failures fail loudly
- the public contract clearly defines when app user rows are created

### Why This Wins

- It keeps identity resolution predictable.
- It solves the real integration pain without adding surprising read-time mutation.

## 13. MCP Key Role Semantics

### Problem

The audit raised a valid concern about bound MCP keys inheriting later role changes.

### Alternatives Considered

#### A. Keep role-following semantics and document them

Why it was attractive:

- matches current behavior
- low complexity

#### B. Add `maxRole` now

Why it was attractive:

- better scoped key issuance

Why it was not chosen for v1:

- useful, but not required for a coherent v1 contract
- not on the critical path compared to tenant safety, layout, and trust model consistency

### Decision

Trellis v1 keeps role-following semantics.

It will:

- document them clearly
- improve observability around bound-key behavior

`maxRole` is deferred post-v1 unless implementation work reveals it is cheap enough to include late without destabilizing the release.

### Why This Wins

- It keeps the v1 scope focused on the highest-risk areas.

## 14. `trellis doctor` And ESLint Scope

### Problem

The repo already knows more about safe usage than the shipped tooling currently enforces.

### Alternatives Considered

#### A. Leave `doctor` narrow and rely on docs

Why it was rejected:

- Trellis already has the analysis machinery
- leaving it unused would be wasteful

#### B. Build a large new diagnostic product surface

Why it was attractive:

- stronger operator experience

Why it was only partly chosen:

- not all proposed tools are necessary for v1

#### C. Extend the current `doctor` and ESLint surfaces with the highest-value checks

Decision:

Accepted.

### Decision

For v1, Trellis extends existing tooling rather than inventing a new diagnostic stack.

`doctor` and ESLint will cover:

- tenant completeness and global-table exceptions
- destructive-safety schema requirements
- unsafe access justification
- trusted-forwarding misuse and obvious leakage paths
- guard misuse
- feature composition drift

Tools explicitly deferred from the larger proposal:

- secret-history scanning
- client bundle deep scanning beyond high-value configuration checks
- `trellis trace`
- tutorial-style CLIs

### Why This Wins

- It captures most of the value with tooling Trellis already ships.
- It keeps v1 scope disciplined.

## Final v1 Contract

If this RFC is accepted, Trellis v1's client-facing contract is:

- root shell plus `features/*` architecture
- schema-derived tenant isolation by default
- trusted forwarding with production hardening and simple rotation support
- explicit unsafe surfaces with required reasons and audit visibility
- one canonical server identity story
- one-authoring-source contracts via `defineArgs`
- one progressive starter ladder
- one consistent story across docs, examples, CLI, ESLint, and runtime

## Rollout Order

This work should land serially.

1. Safety primitives and naming hard cut.
2. Thin feature composition helpers.
3. Rewrite example 03 as the canonical protected vertical app.
4. Update CLI templates and generators.
5. Rewrite example 04.
6. Rewrite examples 07 and 08.
7. Rewrite the remaining examples and docs.
8. Tighten doctor and ESLint to the new contract.

## Release Gates

Trellis is considered v1-ready on this RFC only when all of the following are true:

- docs, examples, CLI, and runtime describe the same architecture
- no official example uses casts for unsafe DB access
- no official example uses the webhook-bot path as the canonical story
- `doctor` fails on tenant-classification drift and destructive-safety drift
- generated apps use the new feature-first layout
- `shared/schemas/*` is no longer part of the public generated shape

Verification bar:

```bash
pnpm run check
pnpm run test:contracts
pnpm run test:examples
pnpm run test:types
```

## Explicitly Deferred

These ideas were considered, but are not part of this RFC's accepted v1 scope:

- full mega-DSL feature authoring
- `_shell/` root convention
- keeping the current lane-first layout as the final public contract
- collapsing `guard` and `authorize`
- read-time actor bootstrap mutations
- first-class service-account model
- `maxRole` on MCP keys as a v1 requirement
- `trellis trace`
- tutorial CLI flows
- a full vocabulary rewrite like `guard -> rule`

## Consequences

This RFC intentionally chooses a strong direction.

The consequences are:

- Trellis will break from its current pre-v1 generated shape
- several examples and docs will need full rewrites, not edits
- CLI and doctor need to become first-class parts of the contract, not helpers orbiting it
- after the cut, Trellis will have a much stronger claim to be opinionated in a coherent way

That is the right trade.

The alternative is preserving more of the old shape and shipping a v1 that already carries avoidable institutional debt.
