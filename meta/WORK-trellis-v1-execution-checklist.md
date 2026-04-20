# Trellis v1 Execution Checklist

Status: Implementation complete
Date: 2026-04-20
Primary decision record: [meta/RFC-trellis-v1-final-form-v2.md](/Users/matthias/Git/0_libs/WORK/trellis/meta/RFC-trellis-v1-final-form-v2.md:1)
Audience: Trellis maintainers and implementation team

## Purpose

This is the execution document for Trellis v1.

It turns the accepted RFC into a concrete implementation checklist.

The rule is simple:

- a checkbox is marked complete only when the code, docs, tests, and verification for that item are done
- when every required checkbox in this document is complete, Trellis v1 is considered implementation-complete against the RFC

## How To Use This Document

- Use this as the source of truth for execution status.
- Do not mark an item complete because code exists without verification.
- If a checkbox is blocked, add a short note directly under that item.
- If the ratification checkpoint fails, update this document and the RFC together before continuing.
- Do not open new parallel architecture directions outside the explicit fallback path defined here.

## Completion Standard

An item is complete only when all of the following are true:

- implementation is merged or ready to merge
- relevant tests exist and pass
- relevant docs and examples are updated
- lint and type checks pass for affected surfaces
- no known blocker remains for downstream work

## Global Verification Commands

These are the baseline repo-level verification commands for the workstreams below:

```bash
pnpm run check
pnpm run test:contracts
pnpm run test:examples
pnpm run test:types
```

Use narrower checks while iterating, but do not mark a release-gating item complete without the relevant repo-level verification.

## Global Rules

- [x] No new public dual-path architecture is introduced.
- [x] No compatibility shims are added for pre-v1 layout choices unless explicitly called out in this document.
- [x] No public example uses cast-based unsafe DB access.
- [x] No public example teaches the webhook-bot pattern as the canonical path.
- [x] `shared/schemas/*` is not part of the new generated public shape.
- [x] All new diagnostics and docs use `manifest` consistently when referring to composed feature output.

## Workstream 0: Freeze Decision Surface

### Goal

Lock the execution surface so implementation does not drift from the accepted RFC.

### Checklist

- [x] Add this work document to the repo and link it from the RFC if useful.
- [x] Confirm the accepted decision record is [meta/RFC-trellis-v1-final-form-v2.md](/Users/matthias/Git/0_libs/WORK/trellis/meta/RFC-trellis-v1-final-form-v2.md:1).
- [x] Confirm the implementation team understands the ratification checkpoint and fallback rule.
- [x] Confirm the team will use `FeatureManifest` as the composition type name.

### Acceptance Criteria

- The team has one execution document and one RFC to follow.
- There is no ambiguity about which RFC version governs the work.

### Verification

- Verify the RFC and this checklist are both present under `meta/`.
- Verify no newer contradictory planning doc is being treated as source of truth.

## Workstream 1: Feature Composition Primitive

### Goal

Add the thin composition layer required by the RFC without turning it into a large authoring DSL.

### Implementation Steps

- [x] Add `defineFeature(...)` in the runtime.
- [x] Add `composeFeatures(...)` in the runtime.
- [x] Add a named `FeatureManifest` type.
- [x] Ensure `composeFeatures(...)` returns a `FeatureManifest`.
- [x] Ensure `FeatureManifest` exposes:
  - `schema`
  - `permissions`
  - `tenantTables`
  - `globalTables`
- [x] Ensure generated composition examples can destructure the manifest outputs locally.
- [x] Export the composition surface from the published package where needed.
- [x] Add unit tests for feature definition and composition behavior.

### Acceptance Criteria

- `defineFeature(...)` and `composeFeatures(...)` exist as thin aggregation helpers.
- The composition surface does not replace handler authoring primitives.
- `FeatureManifest` is concrete enough to drive schema export, permission aggregation, and tenant classification.

### Verification

- [x] Type tests cover the `FeatureManifest` shape.
- [x] Unit tests verify composed schema aggregation.
- [x] Unit tests verify composed permission aggregation.
- [x] Unit tests verify `tenantTables` and `globalTables` outputs.
- [x] `pnpm run test:contracts` passes after the new surface is added.

## Workstream 2: Runtime-Neutral Contract Source

### Goal

Move feature contracts to one explicit runtime-neutral home and make `defineArgs` the contract source of truth.

### Implementation Steps

- [x] Define the canonical contract location as `shared/features/<name>/contract.ts`.
- [x] Update scaffolds and examples so every feature has a contract file at that path.
- [x] Ensure contracts use `defineArgs`.
- [x] Ensure Convex-facing consumers import from `shared/features/*`.
- [x] Ensure Nuxt-facing consumers import from `shared/features/*`.
- [x] Remove new uses of `shared/schemas/*` from generated paths.
- [x] Add or update lint rules so `shared/features/*` cannot import Vue, Nuxt, or Convex server modules.
- [x] Document the narrow purpose of `shared/features/*`.

### Acceptance Criteria

- Every feature contract has one canonical location.
- `shared/features/*` stays narrow and contract-focused.
- No new generated app relies on `shared/schemas/*`.

### Verification

- [x] Search for newly generated references to `shared/schemas/*` and confirm none remain.
- [x] Lint rules fail when `shared/features/*` imports runtime-specific modules.
- [x] Type checks pass for shared contract imports across server and app code.
- [x] `pnpm run test:types` passes with the new contract location.

Note:

- Generated starters and `trellis add entity` now emit runtime-neutral contracts under `shared/features/<plural>/contract.ts` and consume `defineArgs` plus `.zod` from that single source.
- Public examples, starters, and `trellis add entity` now use runtime-neutral contracts under `shared/features/*`, and the docs explicitly describe `shared/features/*` as contract-only.

## Workstream 3: Tenant Isolation Derivation

### Goal

Eliminate tenant omission risk without shipping runtime field magic as the v1 contract.

### Implementation Steps

- [x] Replace hand-maintained tenant isolation usage with build-time derived classification.
- [x] Make composed schema analysis the derivation source for tenant-scoped tables.
- [x] Allow feature metadata to provide override-only exceptions, especially `globalTables`.
- [x] Ensure the runtime consumes explicit derived `tenantTables` and `globalTables`.
- [x] Update examples and scaffolds to use the derived classification flow.
- [x] Add diagnostics for incomplete tenant classification.
- [x] Add tests for tenant classification drift.

### Acceptance Criteria

- Tenant isolation is not maintained by a freehand table list.
- Tenant classification is explicit, inspectable, and derived before runtime execution.
- `doctor`, ESLint, generators, and runtime consume the same classification model.

### Verification

- [x] Add a fixture where a tenant table is omitted and confirm `doctor` fails.
- [x] Add a fixture where a `globalTables` exception is required and confirm the derived output is correct.
- [x] Add tests proving runtime uses the derived table set rather than hand-authored lists.
- [x] `pnpm run test:contracts` passes with the new derivation path.

Note:

- Trellis now derives tenant-scoped tables from composed feature schema analysis, applies manifest `globalTables` as explicit overrides, and feeds that same classification into runtime validation, `doctor`, tests, scaffolds, and examples.

## Workstream 4: Unsafe Surface Hard Cut

### Goal

Replace neutral or ambiguous unsafe surfaces with two explicit, auditable escape hatches.

### Implementation Steps

- [x] Replace builder-level `raw.query(...)` and `raw.mutation(...)` with `unsafe.query(...)` and `unsafe.mutation(...)`.
- [x] Require definition-time justification on builder-level unsafe handlers, for example `bypass: '<reason>'`.
- [x] Replace cast-based tenant escape usage with `ctx.db.escapeTenantIsolation({ reason })`.
- [x] Ensure `ctx.db.escapeTenantIsolation({ reason })` is typed and does not require casts in user code.
- [x] Ensure both unsafe surfaces emit audit/observability events with reasons attached.
- [x] Remove or avoid introducing a third public DB-level full-bypass API unless a concrete need emerges and is explicitly approved.
- [x] Update docs and examples to teach the two-surface unsafe taxonomy.
- [x] Update lint rules to enforce unsafe justifications.

### Acceptance Criteria

- There are exactly two public unsafe escape hatches in the v1 contract.
- Builder-level unsafe usage requires justification.
- DB-level tenant escape requires inline reason.
- Official examples no longer use cast-based unsafe DB access.

### Verification

- [x] Search examples for `as .*crossTenant` and confirm no public example requires those casts.
- [x] Add lint coverage for missing `bypass` reasons on `unsafe.*`.
- [x] Add lint coverage for missing `reason` on `escapeTenantIsolation(...)`.
- [x] Add runtime tests verifying unsafe events include reason strings.
- [x] `pnpm run lint` passes after the unsafe rename lands.

Note:

- This workstream is complete. The public runtime is hard-cut from `raw` / `crossTenant` to `unsafe` / `escapeTenantIsolation({ reason })`, public examples and CLI templates are aligned, both seams emit observable signals with reasons attached, and lint/runtime checks enforce the required justifications.

## Workstream 5: Trusted Forwarding Hardening

### Goal

Ship a v1-appropriate trusted-forwarding posture without widening scope unnecessarily.

### Implementation Steps

- [x] Add production runtime rejection for weak trusted-forwarding keys.
- [x] Add production runtime rejection for obviously dev-like trusted-forwarding keys.
- [x] Update docs to explain trusted-forwarding risks and operational handling.
- [x] Extend `doctor` to catch obvious trusted-forwarding misuse or leakage paths.
- [x] Remove webhook-bot as a canonical learning-path pattern in examples and docs.
- [x] Decide whether optional `current` / `previous` key support lands cheaply enough for v1.
- [x] If key rotation does not land cheaply, explicitly leave it out without blocking v1.

### Acceptance Criteria

- Weak/dev-like keys are runtime-rejected in production.
- Docs and `doctor` reflect the hardened model.
- One canonical server identity story remains: trusted forwarding plus optional delegation.

### Verification

- [x] Add runtime tests for weak-key rejection.
- [x] Add runtime tests for dev-like key rejection.
- [x] Add `doctor` fixture coverage for obvious misuse or missing configuration.
- [x] Verify no public example presents webhook-bot as canonical.
- [x] `pnpm run test:contracts` passes for trusted-forwarding behavior.

Note:

- v1 now rejects weak or placeholder trusted-forwarding keys in production on both the receiving path and the server-owned caller path.
- `doctor` now fails on placeholder trusted-forwarding keys and obvious public exposure paths.
- Public docs and example READMEs now point to trusted forwarding plus optional delegation as the canonical server identity story.
- Optional `current` / `previous` rotation support is explicitly left out of required v1 scope unless it lands trivially later.

## Workstream 6: Protected Handler Ergonomics

### Goal

Keep the four-phase model while making the common cases simpler and better taught.

### Implementation Steps

- [x] Preserve `guard`, `load`, `authorize`, and `handler` as the core pipeline.
- [x] Add `authorize` shorthand support for:
  - direct guard/check factory
  - `(actor, loaded) => ...`
  - `{ check: ... }`
- [x] Add lint rules rejecting record loading or DB access inside `guard`.
- [x] Update docs and examples to explain when each phase is used.
- [x] Keep the advanced explicit object form available.

### Acceptance Criteria

- The runtime model stays four-phase.
- The common authorization case is less ceremonial.
- Lint and docs steer users away from phase misuse.

### Verification

- [x] Add type tests covering all three accepted `authorize` forms.
- [x] Add lint tests for DB access inside `guard`.
- [x] Update at least the canonical example docs to show correct usage.
- [x] `pnpm run test:contracts` passes after the shorthand lands.

Note:

- The runtime still executes the same four phases in the same order. This tranche only reduces ceremony around the common `authorize` cases.
- `authorize` now accepts a loaded-resource factory, an explicit `(actor, loaded)` function, or the existing object form with `check`.
- ESLint now flags inline `guard` functions that try to do async or DB work, steering record-bound logic back into `load` + `authorize`.

## Workstream 7: Starter Ladder And Auth Bootstrap

### Goal

Align the public starter surface with the product teaching path and remove surprising bootstrap behavior.

### Implementation Steps

- [x] Add a real `public` starter to the CLI.
- [x] Define the `public` starter as the zero-auth, live-query baseline.
- [x] Simplify `personal` so it does not scaffold full permission context by default.
- [x] Keep `workspace` as the canonical protected starter.
- [x] Keep `cms` as the content/studio starter.
- [x] Move bootstrap wiring into framework-owned auth integration paths.
- [x] Ensure `ctx.actor()` does not mutate as part of bootstrap.
- [x] Fail loudly when bootstrap wiring is missing or broken.

### Acceptance Criteria

- Docs and CLI expose the same starter ladder.
- `personal` no longer over-teaches permissions.
- Bootstrap is framework-owned and not read-time mutation.

### Verification

- [x] `trellis init` exposes `public`, `personal`, `workspace`, and `cms`.
- [x] Generated `public` scaffold contains no auth or permission-context wiring.
- [x] Generated `personal` scaffold reflects the simplified surface.
- [x] Tests cover bootstrap success and failure modes.
- [x] `pnpm run check:cli` passes with the new starters.

Note:

- The starter ladder is now implemented in the CLI. Generated public apps are auth-free, personal apps no longer scaffold permission context by default, and workspace/cms retain the protected starter paths.
- The bootstrap behavior was already framework-owned via the Better Auth integration and client bootstrap watcher. This tranche verified that existing path rather than replacing it.

## Workstream 8: Shell And Boundary Enforcement

### Goal

Make the shell-vs-feature boundary explicit and enforceable so the architecture does not drift immediately.

### Implementation Steps

- [x] Define and enforce that shell code may not import feature internals.
- [x] Allow features to import shell primitives.
- [x] Prevent deep imports between features; allow cross-feature access only through `features/<name>/index.ts`.
- [x] Allow tests inside a feature to reach into that feature.
- [x] Add or update lint rules enforcing these boundaries.
- [x] Apply the same shell + features rule inside component boundaries.

### Acceptance Criteria

- The shell-vs-feature line is enforced by tooling, not convention only.
- Example 08's component boundary follows the same model.

### Verification

- [x] Add ESLint tests for shell importing feature internals.
- [x] Add ESLint tests for cross-feature deep imports.
- [x] Add example coverage or fixture coverage for component-boundary layout.
- [x] `pnpm run lint` passes with the new boundaries enforced.

Note:

- Boundary enforcement now lives in the ESLint plugin via `feature-boundaries`.
- The rule is intentionally narrow: it only applies inside roots that actually own a `features/` directory, so unreworked lane-first examples do not get noisy false positives while the ratification rewrite is still in flight.

## Workstream 9: Example 03 Ratification Build

### Goal

Use `examples/03-team-workspace` and the matching scaffold as the proof gate for the new public architecture.

### Implementation Steps

- [x] Rewrite example 03 to the target architecture.
- [x] Move feature contracts to `shared/features/*`.
- [x] Move Convex business code into `convex/features/*`.
- [x] Update example 03 app-side structure to `app/features/*` where appropriate.
- [x] Remove cast-based unsafe DB access from example 03.
- [x] Update the matching CLI scaffold to generate the same shape.
- [x] Apply boundary lint rules to example 03 and the scaffolded output.

### Acceptance Criteria

- Example 03 works cleanly under the target shape.
- The corresponding scaffold generates the same shape.
- Unsafe access works without casts.
- Boundary rules hold without ad-hoc disables.

### Verification

- [x] Run example 03 tests successfully.
- [x] Generate the matching scaffold and diff the canonical layout against documented shape.
- [x] Confirm boundary lint passes with zero disables for repo-owned example/scaffold code.
- [x] Confirm no cast-based unsafe access remains in example 03.

Note:

- Example 03 now uses `shared/features/*` contracts, `convex/features/*` business modules, a composed manifest for permission aggregation and tenant metadata, and feature-routed Convex APIs.
- The matching workspace scaffold now emits the same root shell + `convex/features/*` + `shared/features/*` + `app/features/*` shape, and a generated proof app no longer leaks old `convex/domain` / `shared/schemas` paths.
- Example 03 and the matching workspace scaffold are now the ratified proof case for the public contract.

## Workstream 10: Ratification Checkpoint

### Goal

Make one explicit go/no-go decision on whether `features/*` becomes the promoted v1 public contract.

### Checklist

- [x] Hold the ratification checkpoint after example 03 and its matching scaffold are complete.
- [x] Decide whether `features/*` is promoted to the public contract.
- [x] Ratification result: `features/*` is promoted to the public v1 contract and the remaining example rewrites continue on that shape.
- [x] Fallback path was not chosen, so no RFC amendment was required.
- [x] The post-ratification implementation followed the ratified contract without reopening the architecture decision.

### Acceptance Criteria

- There is one explicit ratification decision.
- The team does not continue to example 04 while still ambiguous about the public architecture.

### Verification

- [x] Record the ratification result in the RFC or adjacent decision note.
- [x] Verify the next implementation workstream matches that ratified decision.

## Workstream 11: Remaining Example Rewrites

### Goal

Bring the public examples into alignment with the ratified v1 contract.

### Checklist

- [x] Rewrite example 04 to the ratified contract.
- [x] Rewrite example 07 to the ratified contract.
- [x] Rewrite example 08 to the ratified contract.
- [x] Rewrite examples 01, 02, 05, and 06 to the ratified contract.
- [x] Remove webhook-bot as canonical from the learning path.
- [x] Ensure component boundaries in example 08 obey the same shell + features model.
- [x] Ensure public examples use the new unsafe and trusted-forwarding stories consistently.

### Acceptance Criteria

- Public examples no longer teach conflicting architectural or identity stories.
- Examples 03 through 08 form a coherent learning path.

### Verification

- [x] `pnpm run test:examples` passes after all example rewrites.
- [x] `pnpm run lint` passes for repo-owned authored example code with zero disables on public examples. Generated Convex output is excluded from this gate.
- [x] Search public examples for old unsafe naming and webhook-bot canonical teaching remnants.

Note:

- Example 03's webhook path was also cut over from the old synthetic webhook-bot helper to a trusted-forwarding service principal plus delegation, so no public example retains the bot-user pattern as an implementation path.

## Workstream 12: CLI And Generator Alignment

### Goal

Make the CLI generate the ratified architecture and vocabulary consistently.

### Implementation Steps

- [x] Update `trellis init` to generate the ratified shape.
- [x] Update `trellis add` surfaces to match new terminology, especially `add entity`.
- [x] Update resource/entity patchers to stop assuming the old lane-first structure where the ratified contract no longer does.
- [x] Update generated comments and scaffold code to use `manifest` terminology consistently.
- [x] Ensure scaffolded composition code may destructure `FeatureManifest` outputs locally.

### Acceptance Criteria

- CLI output matches the documented canonical layout.
- CLI vocabulary matches the RFC.
- Scaffold comments and code use `manifest` consistently where composition is described.

### Verification

- [x] `pnpm run check:cli` passes.
- [x] Generated app output matches the documented canonical layout.
- [x] Search scaffolds for old `resource` terminology where `entity` is intended.

## Workstream 13: Docs And Learning Path Rewrite

### Goal

Bring docs into complete alignment with the ratified contract.

### Checklist

- [x] Update the top-level README to reflect the ratified contract.
- [x] Update canonical layout docs.
- [x] Update getting-started docs for the starter ladder.
- [x] Add or update docs for the unsafe taxonomy.
- [x] Add or update docs for the four-phase handler model.
- [x] Add or update docs for the canonical server identity story.
- [x] Update docs to explain `shared/features/*` and `app/features/*`.
- [x] Update docs to explain component boundaries as mini-Trellis boundaries.
- [x] Update docs and examples to use `manifest` consistently.

### Acceptance Criteria

- Docs, examples, and generators describe the same product.
- The public teaching path reflects the new starter ladder and architecture.

### Verification

- [x] `pnpm run check:docs:api-surface` passes.
- [x] `pnpm run check:docs:links` passes.
- [x] Manual spot-check of top-of-funnel docs against scaffold output is complete.

## Workstream 14: `doctor` And ESLint Completion

### Goal

Turn the new contract into enforceable guardrails.

### Checklist

- [x] Extend `doctor` to catch tenant classification completeness failures.
- [x] Extend `doctor` to catch destructive-safety schema requirement failures.
- [x] Extend `doctor` to catch obvious trusted-forwarding misuse or leakage paths.
- [x] Extend `doctor` to catch manifest-composition drift where applicable.
- [x] Add ESLint rules for unsafe justification.
- [x] Add ESLint rules for shell-vs-feature boundaries.
- [x] Add ESLint rules for `shared/features/*` runtime-neutral boundaries.
- [x] Add ESLint rules for `guard` misuse.

### Acceptance Criteria

- `doctor` and ESLint enforce the same core safety and architecture assumptions the RFC depends on.

### Verification

- [x] Add fixtures for each new `doctor` failure mode.
- [x] Add ESLint test cases for each new rule.
- [x] `pnpm run test:contracts` passes.
- [x] `pnpm run lint` passes.

## Workstream 15: Testing Posture

### Goal

Keep testing changes aligned with the RFC's explicit "not now" decision.

### Checklist

- [x] Keep current testing primitives as the v1 baseline.
- [x] Do not add a fixture DSL unless explicitly approved as scope change.
- [x] Do not add permission snapshot matchers unless explicitly approved as scope change.
- [x] Update tests only as needed to support the new architecture and safety rules.

### Acceptance Criteria

- Testing coverage is sufficient for the new architecture and safety surfaces.
- Deferred testing ergonomics work does not silently creep into v1 scope.

### Verification

- [x] Check that no new fixture DSL or matcher surface has been introduced accidentally.
- [x] `pnpm run test:contracts` and `pnpm run test:examples` pass.

## Workstream 16: Release Readiness

### Goal

Confirm that the implementation is complete against the RFC and ready to be treated as the v1 contract.

### Release Gates

- [x] `trellis init` output matches the documented canonical layout.
- [x] Every repo-owned public example and authored scaffold path passes the new ESLint preset with zero disables. Generated Convex output is excluded from this gate.
- [x] No public example uses casts for unsafe DB access.
- [x] No public example teaches the webhook-bot path as canonical.
- [x] Generated output no longer includes `shared/schemas/*`.
- [x] `doctor` fails on tenant-classification drift.
- [x] `doctor` fails on destructive-safety drift.
- [x] The ratified architecture decision has been recorded and reflected in docs and scaffolds.

### Final Verification

- [x] `pnpm run check`
- [x] `pnpm run test:contracts`
- [x] `pnpm run test:examples`
- [x] `pnpm run test:types`

### Done Means Done

- [x] RFC and implementation match.
- [x] CLI, docs, runtime, examples, and tooling all reflect the same contract.
- [x] No open blocker remains for calling the Trellis v1 shape complete.

## Workstream 17: Canonical Subject Builders

### Goal

Close the remaining string-literal footgun around canonical subject construction without widening the auth model.

### Implementation Steps

- [x] Add canonical subject builders to the auth surface.
- [x] Add a lower-level `createSubject(kind, value)` helper.
- [x] Export the builders from `@lupinum/trellis/auth`.
- [x] Update runtime call sites that construct canonical subjects programmatically.
- [x] Update at least the public trusted-forwarding and MCP example call sites to use the builders.
- [x] Add unit tests for valid and invalid canonical subject construction.

### Acceptance Criteria

- Canonical subject parsing and construction both exist as first-class helpers.
- Runtime and example code no longer rely only on ad hoc string interpolation for canonical subject construction.
- The change stays additive and does not reopen the identity model.

### Verification

- [x] `pnpm exec vitest run tests/unit/auth-subject.test.ts tests/unit/trusted-forwarding.test.ts tests/unit/define-convex-tool.test.ts tests/unit/create-component-bridge.test.ts`
- [x] `pnpm exec tsc -p tsconfig.types.json --noEmit`
- [x] `pnpm run check:publish-surface`
- [x] `pnpm run lint`
- [x] `pnpm run test:contracts`
- [x] `pnpm run test:examples`

Note:

- This was a post-RFC hardening improvement, not a direction change. It fills the API gap between existing subject parsing helpers and hand-written subject construction at call sites.

## Deferred Work

These are intentionally out of scope for this checklist unless explicitly promoted later:

- [x] trusted-forwarding key rotation support if it does not land cheaply remains explicitly deferred from v1 scope
- [x] first-class service-account model remains explicitly deferred from v1 scope
- [x] `trellis trace` remains explicitly deferred from v1 scope
- [x] fixture builders remain explicitly deferred from v1 scope
- [x] permission snapshot matchers remain explicitly deferred from v1 scope
- [x] large feature-authoring DSLs remain explicitly deferred from v1 scope
- [x] `_shell/` root convention remains explicitly deferred from v1 scope
- [x] alternative final architecture contracts outside the explicit fallback remain explicitly deferred from v1 scope

These deferred items were intentionally left out of v1 and should only be re-opened by an explicit scope change after the v1 contract.
