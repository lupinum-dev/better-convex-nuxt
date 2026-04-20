# Trellis TypeScript Execution Checklist

Status: Proposed
Date: 2026-04-20
Primary architecture record: [meta/RFC-trellis-v1-final-form-v2.md](/Users/matthias/Git/0_libs/WORK/trellis/meta/RFC-trellis-v1-final-form-v2.md:1)
Primary TypeScript research record: [meta/tanstack-router-typescript-patterns-for-trellis.md](/Users/matthias/Git/0_libs/WORK/trellis/meta/tanstack-router-typescript-patterns-for-trellis.md:1)
Audience: Trellis maintainers and implementation team

## Purpose

This is the execution document for the next TypeScript quality pass after the Trellis v1 architecture refactor.

It turns the TanStack-inspired TypeScript learnings into a concrete implementation checklist for Trellis.

The rule is simple:

- a checkbox is marked complete only when the code, docs, tests, and verification for that item are done
- when every required checkbox in this document is complete, the Trellis TypeScript refactor is considered implementation-complete against this plan

## Why This Exists

The v1 refactor fixed architecture, boundaries, starter shape, unsafe surfaces, and generated layout.

The next gain is TypeScript quality:

- narrower autocomplete
- earlier and simpler compile-time errors
- fewer casts and fewer manual annotations in user code
- safer refactors across operations, tools, projections, and shared contracts
- stronger confidence that the published type surface matches the intended API

This document is not about changing Trellis’s product shape again. It is about making the existing shape easier and safer to consume through better type architecture and verification.

## How To Use This Document

- Use this as the source of truth for the TypeScript refactor status.
- Do not mark an item complete because helper types exist without consumer verification.
- Do not mark an item complete because internal source compiles if the published type surface is still unverified.
- If an item is blocked, add a short note directly under that item.
- If one workstream reveals that a planned direction is wrong, update this document and the research record together before continuing.

## Completion Standard

An item is complete only when all of the following are true:

- implementation is merged or ready to merge
- relevant tests exist and pass
- relevant docs and examples are updated where the user-facing API changed
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

- [ ] No new public dual-path API is introduced unless explicitly called out in this document.
- [ ] No compatibility shims are added for legacy flat-object type surfaces unless explicitly called out in this document.
- [ ] No new public API depends on runtime assertion where the same guarantee can reasonably be expressed at compile time.
- [ ] No new public docs teach casts as the normal escape hatch for type-system gaps.
- [ ] No new module augmentation targets repo-internal paths when a stable public package entrypoint exists.
- [ ] Public helper types are exported intentionally; internal inference scaffolding is not treated as user API by accident.

## Workstream 0: Freeze Decision Surface

### Goal

Lock the TypeScript refactor surface so the work stays aligned with the accepted Trellis v1 architecture and the TanStack-derived research.

### Checklist

- [ ] Add this execution document to the repo.
- [ ] Confirm the governing architecture record is [meta/RFC-trellis-v1-final-form-v2.md](/Users/matthias/Git/0_libs/WORK/trellis/meta/RFC-trellis-v1-final-form-v2.md:1).
- [ ] Confirm the governing TypeScript research record is [meta/tanstack-router-typescript-patterns-for-trellis.md](/Users/matthias/Git/0_libs/WORK/trellis/meta/tanstack-router-typescript-patterns-for-trellis.md:1).
- [ ] Confirm the implementation team understands that this pass is a hardening and simplification pass, not a new architecture rewrite.
- [ ] Confirm the team will prefer delete > simplify > replace > add when changing type surfaces.

### Acceptance Criteria

- There is one execution document and one research record for the TypeScript pass.
- There is no ambiguity about whether this pass is allowed to reopen the v1 product architecture.

### Verification

- [ ] Verify this checklist and the research record are present under `meta/`.
- [ ] Verify no newer contradictory TypeScript planning doc is being treated as source of truth.

## Workstream 1: Shared Type Utility Kernel

### Goal

Replace scattered one-off utility types with one small, stable internal utility kernel.

### Implementation Steps

- [ ] Add a shared utility module for reusable type helpers.
- [ ] Start with the minimum set:
  - `NoInfer`
  - `Expand` or `Simplify`
  - `Assign`
  - `UnionToIntersection`
  - `IsUnknown`
- [ ] Move duplicated local helpers from operation, MCP, Convex shared, and observability code into the shared module where appropriate.
- [ ] Delete superseded local helper implementations rather than wrapping them.
- [ ] Document which helpers are internal-only and which are intended to become public.

### Acceptance Criteria

- Trellis has one clear internal vocabulary for common type operations.
- Repeated helper logic is reduced rather than duplicated under new names.

### Verification

- [ ] Search for duplicated local utility helpers and confirm the targeted copies are removed.
- [ ] `pnpm run test:types` passes after the utility consolidation.
- [ ] `pnpm run check` passes after the utility consolidation.

## Workstream 2: Public Registry Expansion

### Goal

Generalize the successful `RegisteredPermissions` pattern into a broader registry-driven type model.

### Implementation Steps

- [ ] Define stable public registry seams for:
  - `RegisteredOperations`
  - `RegisteredOperationProjections`
  - `RegisteredTools`
  - `RegisteredCapabilities` if needed
- [ ] Keep the registry seams open via declaration merging on stable public modules.
- [ ] Reuse the same codegen discipline already used for registered permissions where applicable.
- [ ] Ensure the rest of the public API reads through registries instead of recovering the same facts from flat object literals.
- [ ] Avoid introducing new runtime-only registries for public type guarantees.

### Acceptance Criteria

- Operations, projections, and tools have stable type registration seams.
- Public helper types can read from registries rather than rebuilding type information ad hoc.

### Verification

- [ ] Add type tests that prove registered operation and tool ids narrow correctly.
- [ ] Add tests that prove unresolved or invalid ids fail at compile time.
- [ ] `pnpm run test:types` passes with the new registry model.

## Workstream 3: Generated Lookup Maps For Operations And Tools

### Goal

Generate concrete lookup maps for operation and tool identity instead of relying on late inference and runtime validation.

### Implementation Steps

- [ ] Generate lookup maps for:
  - `OperationsById`
  - `OperationExecutionsById`
  - `OperationPreviewsById`
  - `ToolsByName`
- [ ] Ensure the generated maps feed the corresponding registry seams.
- [ ] Ensure the generated maps are derived from one source of truth instead of parallel manual registration.
- [ ] Keep the generated surface narrow and inspectable.
- [ ] Update related helper types to index into the generated maps.

### Acceptance Criteria

- Operation and tool identity is represented concretely in generated types.
- Public APIs no longer need to infer identity “from nowhere” when the repo can generate it explicitly.

### Verification

- [ ] Add generator or unit tests that snapshot the emitted lookup-map shape.
- [ ] Add consumer type tests that compile against the generated maps.
- [ ] `pnpm run test:contracts` passes after the generation path is added.
- [ ] `pnpm run test:types` passes with generated consumer coverage.

## Workstream 4: Projection Identity Hard Cut

### Goal

Move execute vs preview projection safety out of runtime-only validation and into typed projection identity.

### Implementation Steps

- [ ] Introduce a branded projection ref type for operation projections.
- [ ] Make `tool.fromOperation(...)` consume branded execute and preview refs rather than raw generic function refs.
- [ ] Keep the runtime assertion path only as a defensive safety net in development.
- [ ] Remove type-level dependence on generic `AnyFunctionRef` where projection identity should already be known.
- [ ] Update docs and examples if the public projection authoring syntax changes.

### Acceptance Criteria

- Projection mismatches are primarily compile-time failures.
- Runtime projection binding validation is no longer the main enforcement mechanism.

### Verification

- [ ] Add type tests proving execute and preview refs cannot be swapped.
- [ ] Add unit tests proving runtime assertions still defend against malformed manual input.
- [ ] `pnpm run test:types` passes after the projection ref cutover.
- [ ] `pnpm run test:contracts` passes after the projection ref cutover.

## Workstream 5: Earlier Generic Capture For Heavy APIs

### Goal

Refactor the heaviest public generic surfaces so important type facts are bound early instead of reconstructed from one large object.

### Implementation Steps

- [ ] Identify the target APIs for earlier binding:
  - `defineOperation(...)`
  - structured handler authoring
  - MCP tool authoring
- [ ] Introduce identity-first or context-first factories where they simplify inference materially.
- [ ] Prefer hard cutovers over permanent dual-path APIs.
- [ ] Keep the new surface narrow and mechanical rather than turning it into a large DSL.
- [ ] Update examples and docs for any changed authoring pattern.

### Acceptance Criteria

- The heaviest public APIs bind schema, identity, or context earlier.
- Error messages become smaller and less indirect.
- The new API shape simplifies typing rather than adding ceremony.

### Verification

- [ ] Add type tests covering the new builder shapes.
- [ ] Add negative tests showing that invalid context, schema, or identity wiring fails earlier.
- [ ] Update at least one canonical example or fixture to use the new form.
- [ ] `pnpm run test:types` passes after the cutover.

## Workstream 6: Hidden Type Carriers For Staged Builders

### Goal

Preserve resolved types across staged builders without repeatedly inferring them from callback signatures.

### Implementation Steps

- [ ] Introduce hidden type carriers for staged builder flows where repeated inference is currently expensive or fragile.
- [ ] Apply the pattern first to the most complex staged surfaces rather than everywhere.
- [ ] Ensure later stages consume the carried type state rather than re-deriving it.
- [ ] Remove superseded repeated `Infer*` chains where the carried type state replaces them.
- [ ] Keep the carrier internal unless a real public need emerges.

### Acceptance Criteria

- Staged builders preserve prior inference explicitly.
- Repeated function-signature introspection is reduced in the targeted surfaces.

### Verification

- [ ] Add type tests proving context, args, loaded values, and results survive through staged builder steps.
- [ ] Review targeted files and confirm the repeated extraction logic is reduced materially.
- [ ] `pnpm run test:types` passes after the carrier refactor.

## Workstream 7: Validator Protocol Unification

### Goal

Make one validator protocol the canonical contract boundary across operations, MCP, and related runtime surfaces.

### Implementation Steps

- [ ] Define the canonical validator protocol around the existing schema system.
- [ ] Add input and output resolution helpers for that protocol.
- [ ] Replace direct dependence on raw `PropertyValidators` where the protocol should be used instead.
- [ ] Ensure function, MCP, and shared contract surfaces speak the same validator language.
- [ ] Keep adapters narrow if multiple validator forms must be supported.

### Acceptance Criteria

- Trellis has one clear validator contract model.
- Public APIs stop leaking multiple subtly different validator concepts where one would do.

### Verification

- [ ] Add type tests covering validator input and output resolution across operations and MCP tools.
- [ ] Add contract tests for at least one cross-surface validator reuse path.
- [ ] `pnpm run test:types` passes after validator unification.

## Workstream 8: Transport Serializability Typing

### Goal

Make serializability rules explicit and compile-time checked at transport boundaries.

### Implementation Steps

- [ ] Add a `ValidateSerializable<T>` style helper for transport-safe payloads.
- [ ] Apply it to MCP result and preview surfaces.
- [ ] Apply it to destructive preview confirmation payloads.
- [ ] Apply it to other high-value transport seams where the payload is meant to cross process or protocol boundaries.
- [ ] Avoid overextending the rule into purely internal runtime objects.

### Acceptance Criteria

- Transport-bound payload types are checked explicitly for serializability.
- Important seams stop degrading to `unknown` or `Record<string, unknown>` unnecessarily.

### Verification

- [ ] Add type tests for accepted serializable payloads.
- [ ] Add negative tests for clearly non-serializable payloads.
- [ ] `pnpm run test:types` passes after serializability typing lands.

## Workstream 9: Public Type Primitives

### Goal

Expose a small public helper layer for the hardest APIs so users do not have to reverse-engineer internal generics.

### Implementation Steps

- [ ] Add a dedicated public type-primitives surface.
- [ ] Start with the smallest useful set, such as:
  - `ValidateOperationId`
  - `ValidateOperationProjection`
  - `ValidatePermissionKey`
  - `ValidateCapabilityKey`
  - `ValidateToolArgs<TSchema, TArgs>`
  - `InferOperationResult`
  - `InferPermissionContext`
  - `ValidateMcpToolOptions`
- [ ] Export only helpers that are stable enough to support intentionally.
- [ ] Avoid exporting raw internal scaffolding types accidentally.
- [ ] Update docs to point advanced users at the public helper layer.

### Acceptance Criteria

- Users have a supported helper layer for validating ids and options against the registered type surface.
- The public API becomes easier to explain and test.

### Verification

- [ ] Add public-entrypoint type tests for each exported helper.
- [ ] Verify helpers compile against registry-driven ids and generated maps.
- [ ] `pnpm run check:publish-surface` passes after the new exports are added.
- [ ] `pnpm run test:types` passes after the helper layer is added.

## Workstream 10: Public-Entrypoint DTS Suite

### Goal

Test the shipped Trellis type surface as consumers see it, not just the internal source files.

### Implementation Steps

- [ ] Add a `tests/dts/` suite for public package entrypoints.
- [ ] Import only published Trellis entrypoints in the new suite.
- [ ] Prefer `expectTypeOf(...)` for new type specs.
- [ ] Keep `@ts-expect-error` only for explicit negative cases.
- [ ] Add a dedicated type-test execution path so the `dts` suite runs as a first-class verification surface rather than an incidental `tsc` side effect.
- [ ] Retain the existing `tests/types` suite while migrating high-value cases into the public-entrypoint suite.

### Acceptance Criteria

- Trellis verifies its published type surface directly.
- Type tests read like public API specs rather than internal implementation probes.

### Verification

- [ ] Create initial `tests/dts/auth.test-d.ts`, `functions.test-d.ts`, `mcp.test-d.ts`, and `testing.test-d.ts`.
- [ ] Confirm the new suite compiles against public entrypoints only.
- [ ] Confirm the dedicated type-test execution path is wired into the repo verification flow.
- [ ] `pnpm run test:types` passes with the new suite included.

## Workstream 11: Generated-Type Consumer Verification

### Goal

Treat generated types as shipped API and verify them as consumer contracts.

### Implementation Steps

- [ ] Snapshot generated permission type output.
- [ ] Snapshot generated operation and tool lookup-map output if added in this plan.
- [ ] Add fixture projects that compile against generated type output.
- [ ] Add fixture coverage for generated Nuxt-facing type augmentations.
- [ ] Ensure the generated output is verified both as text and as consumer-usable types.

### Acceptance Criteria

- Generated declarations are verified at the same level as handwritten public types.
- A generated file that looks plausible but breaks consumer DX fails the verification gate.

### Verification

- [ ] Add fixture compile tests for permission codegen output.
- [ ] Add fixture compile tests for Nuxt augmentation output.
- [ ] `pnpm run test:contracts` passes with generated-output verification included.
- [ ] `pnpm run test:types` passes with generated consumer fixtures.

## Workstream 12: Multi-Version Type Compatibility

### Goal

Make TypeScript compatibility an explicit policy instead of an incidental side effect.

### Implementation Steps

- [ ] Decide the minimum supported TypeScript version range for this pass.
- [ ] Add explicit compatibility verification for at least the lower bound and current supported version.
- [ ] Scope this narrowly to the public type surface rather than every test project if needed.
- [ ] Keep the workflow cheap enough to be sustainable in CI.

### Acceptance Criteria

- Trellis knows which TypeScript versions its public type surface is meant to support.
- Type compatibility is verified intentionally.

### Verification

- [ ] Add the selected compatibility checks to CI or release verification.
- [ ] Document the supported TypeScript range in the package or docs if it changes.
- [ ] `pnpm run check` still passes with the added compatibility policy.

## Workstream 13: Docs And Advanced Guidance

### Goal

Teach the improved TypeScript surface intentionally rather than leaving users to infer it from implementation details.

### Implementation Steps

- [ ] Update API surface docs for any changed operation or MCP builder shapes.
- [ ] Add guidance on public helper types where they materially help advanced users.
- [ ] Update examples if the new type architecture changes recommended authoring style.
- [ ] Document registries and generated type output where that becomes part of the supported model.
- [ ] Keep docs focused on what users should rely on, not on internal scaffolding.

### Acceptance Criteria

- Docs, examples, and types all teach the same supported model.
- Advanced users have a supported path that does not require reading source internals.

### Verification

- [ ] `pnpm run check:docs:api-surface` passes.
- [ ] `pnpm run check:docs:links` passes.
- [ ] Manual spot-check of advanced TS docs against actual public exports is complete.

## Workstream 14: Release Readiness

### Goal

Confirm the TypeScript refactor is complete and the published API is stronger, simpler, and better verified.

### Release Gates

- [ ] Public operation, projection, and tool typing is registry-driven where planned.
- [ ] Projection identity mismatches fail at compile time in the supported API.
- [ ] The heaviest public type surfaces bind key type facts earlier than before.
- [ ] Shared utility types are centralized and duplicated local helpers are reduced.
- [ ] Public helper types exist for the hardest supported surfaces.
- [ ] A public-entrypoint `dts` suite exists and passes.
- [ ] Generated type output is consumer-compiled in fixtures.
- [ ] Docs and examples reflect any public authoring changes.

### Final Verification

- [ ] `pnpm run check`
- [ ] `pnpm run test:contracts`
- [ ] `pnpm run test:examples`
- [ ] `pnpm run test:types`

### Done Means Done

- [ ] The public Trellis type surface is easier to consume than before.
- [ ] The public Trellis type surface is more strongly verified than before.
- [ ] No open blocker remains for shipping the improved TypeScript contract.

## Deferred Work

These are intentionally out of scope for this checklist unless explicitly promoted later:

- [ ] a large feature-authoring DSL remains explicitly deferred
- [ ] permanent public dual-path APIs for both old and new builder shapes remain explicitly deferred
- [ ] broad export of internal inference scaffolding remains explicitly deferred
- [ ] framework-specific type surface redesign outside Trellis’s supported package entrypoints remains explicitly deferred
- [ ] any TypeScript work that reopens the ratified Trellis v1 product architecture remains explicitly deferred

These deferred items should only be reopened by explicit scope change after this checklist.
