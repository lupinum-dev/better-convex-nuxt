# Trellis TypeScript Execution Checklist

Status: Implementation complete
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

- [x] No new public dual-path API is introduced unless explicitly called out in this document.
- [x] No compatibility shims are added for legacy flat-object type surfaces unless explicitly called out in this document.
- [x] No new public API depends on runtime assertion where the same guarantee can reasonably be expressed at compile time.
- [x] No new public docs teach casts as the normal escape hatch for type-system gaps.
- [x] No new module augmentation targets repo-internal paths when a stable public package entrypoint exists.
- [x] Public helper types are exported intentionally; internal inference scaffolding is not treated as user API by accident.

## Workstream 0: Freeze Decision Surface

### Goal

Lock the TypeScript refactor surface so the work stays aligned with the accepted Trellis v1 architecture and the TanStack-derived research.

### Checklist

- [x] Add this execution document to the repo.
- [x] Confirm the governing architecture record is [meta/RFC-trellis-v1-final-form-v2.md](/Users/matthias/Git/0_libs/WORK/trellis/meta/RFC-trellis-v1-final-form-v2.md:1).
- [x] Confirm the governing TypeScript research record is [meta/tanstack-router-typescript-patterns-for-trellis.md](/Users/matthias/Git/0_libs/WORK/trellis/meta/tanstack-router-typescript-patterns-for-trellis.md:1).
- [x] Confirm the implementation team understands that this pass is a hardening and simplification pass, not a new architecture rewrite.
- [x] Confirm the team will prefer delete > simplify > replace > add when changing type surfaces.

### Acceptance Criteria

- There is one execution document and one research record for the TypeScript pass.
- There is no ambiguity about whether this pass is allowed to reopen the v1 product architecture.

### Verification

- [x] Verify this checklist and the research record are present under `meta/`.
- [x] Verify no newer contradictory TypeScript planning doc is being treated as source of truth.

## Workstream 1: Shared Type Utility Kernel

### Goal

Replace scattered one-off utility types with one small, stable internal utility kernel.

### Implementation Steps

- [x] Add a shared utility module for reusable type helpers.
- [x] Start with the minimum set:
  - `NoInfer`
  - `Expand` or `Simplify`
  - `Assign`
  - `UnionToIntersection`
  - `IsUnknown`
- [x] Move duplicated local helpers from operation, MCP, Convex shared, and observability code into the shared module where appropriate.
- [x] Delete superseded local helper implementations rather than wrapping them.
- [x] Document which helpers are internal-only and which are intended to become public.

### Acceptance Criteria

- Trellis has one clear internal vocabulary for common type operations.
- Repeated helper logic is reduced rather than duplicated under new names.

### Verification

- [x] Search for duplicated local utility helpers and confirm the targeted copies are removed.
- [x] `pnpm run test:types` passes after the utility consolidation.
- [x] `pnpm run check` passes after the utility consolidation.

## Workstream 2: Public Registry Expansion

### Goal

Generalize the successful `RegisteredPermissions` pattern into a broader registry-driven type model.

### Implementation Steps

- [x] Define stable public registry seams for:
  - `RegisteredOperations`
  - `RegisteredOperationProjections`
  - `RegisteredTools`
  - `RegisteredCapabilities` if needed
- [x] Keep the registry seams open via declaration merging on stable public modules.
- [x] Reuse the same codegen discipline already used for registered permissions where applicable.
- [x] Ensure the rest of the public API reads through registries instead of recovering the same facts from flat object literals.
- [x] Avoid introducing new runtime-only registries for public type guarantees.

### Acceptance Criteria

- Operations, projections, and tools have stable type registration seams.
- Public helper types can read from registries rather than rebuilding type information ad hoc.

### Verification

- [x] Add type tests that prove registered operation and tool ids narrow correctly.
- [x] Add tests that prove unresolved or invalid ids fail at compile time.
- [x] `pnpm run test:types` passes with the new registry model.

## Workstream 3: Generated Lookup Maps For Operations And Tools

### Goal

Generate concrete lookup maps for operation and tool identity instead of relying on late inference and runtime validation.

### Implementation Steps

- [x] Generate lookup maps for:
  - `OperationsById`
  - `OperationExecutionsById`
  - `OperationPreviewsById`
  - `ToolsByName`
- [x] Ensure the generated maps feed the corresponding registry seams.
- [x] Ensure the generated maps are derived from one source of truth instead of parallel manual registration.
- [x] Keep the generated surface narrow and inspectable.
- [x] Update related helper types to index into the generated maps.

### Acceptance Criteria

- Operation and tool identity is represented concretely in generated types.
- Public APIs no longer need to infer identity “from nowhere” when the repo can generate it explicitly.

### Verification

- [x] Add generator or unit tests that snapshot the emitted lookup-map shape.
- [x] Add consumer type tests that compile against the generated maps.
- [x] `pnpm run test:contracts` passes after the generation path is added.
- [x] `pnpm run test:types` passes with generated consumer coverage.

## Workstream 4: Projection Identity Hard Cut

### Goal

Move execute vs preview projection safety out of runtime-only validation and into typed projection identity.

### Implementation Steps

- [x] Introduce a branded projection ref type for operation projections.
- [x] Make `tool.fromOperation(...)` consume branded execute and preview refs rather than raw generic function refs.
- [x] Keep the runtime assertion path only as a defensive safety net behind compile-time projection identity.
- [x] Remove type-level dependence on generic `AnyFunctionRef` where projection identity should already be known.
- [x] Update docs and examples if the public projection authoring syntax changes.

### Acceptance Criteria

- Projection mismatches are primarily compile-time failures.
- Runtime projection binding validation is no longer the main enforcement mechanism.

### Verification

- [x] Add type tests proving execute and preview refs cannot be swapped.
- [x] Add unit tests proving runtime assertions still defend against malformed manual input.
- [x] `pnpm run test:types` passes after the projection ref cutover.
- [x] `pnpm run test:contracts` passes after the projection ref cutover.

## Workstream 5: Earlier Generic Capture For Heavy APIs

### Goal

Refactor the heaviest public generic surfaces so important type facts are bound early instead of reconstructed from one large object.

### Implementation Steps

- [x] Identify the target APIs for earlier binding:
  - `defineOperation(...)`
  - structured handler authoring
  - MCP tool authoring
- [x] Introduce identity-first or context-first factories where they simplify inference materially.
- [x] Prefer hard cutovers over permanent dual-path APIs.
- [x] Keep the new surface narrow and mechanical rather than turning it into a large DSL.
- [x] Update examples and docs for any changed authoring pattern.

### Acceptance Criteria

- The heaviest public APIs bind schema, identity, or context earlier.
- Error messages become smaller and less indirect.
- The new API shape simplifies typing rather than adding ceremony.

### Verification

- [x] Add type tests covering the new builder shapes.
- [x] Add negative tests showing that invalid context, schema, or identity wiring fails earlier.
- [x] Update at least one canonical example or fixture to use the new form.
- [x] `pnpm run test:types` passes after the cutover.

Note:

- This pass kept early binding deliberately narrow. `defineOperation.withContext(...)` is the supported early-capture surface; wider builder DSL expansion for MCP and structured handlers was audited and rejected as added ceremony without enough type gain.

## Workstream 6: Hidden Type Carriers For Staged Builders

### Goal

Preserve resolved types across staged builders without repeatedly inferring them from callback signatures.

### Implementation Steps

- [x] Introduce hidden type carriers for staged builder flows where repeated inference is currently expensive or fragile.
- [x] Apply the pattern first to the most complex staged surfaces rather than everywhere.
- [x] Ensure later stages consume the carried type state rather than re-deriving it.
- [x] Remove superseded repeated `Infer*` chains where the carried type state replaces them.
- [x] Keep the carrier internal unless a real public need emerges.

### Acceptance Criteria

- Staged builders preserve prior inference explicitly.
- Repeated function-signature introspection is reduced in the targeted surfaces.

### Verification

- [x] Add type tests proving context, args, loaded values, and results survive through staged builder steps.
- [x] Review targeted files and confirm the repeated extraction logic is reduced materially.
- [x] `pnpm run test:types` passes after the carrier refactor.

Note:

- The hidden carriers used in this pass are the branded projection refs and registry-driven lookup maps. They preserve operation identity through staged MCP binding without exposing extra public scaffolding.

## Workstream 7: Validator Protocol Unification

### Goal

Make one validator protocol the canonical contract boundary across operations, MCP, and related runtime surfaces.

### Implementation Steps

- [x] Define the canonical validator protocol around the existing schema system.
- [x] Add input and output resolution helpers for that protocol.
- [x] Replace direct dependence on raw `PropertyValidators` where the protocol should be used instead.
- [x] Ensure function, MCP, and shared contract surfaces speak the same validator language.
- [x] Keep adapters narrow if multiple validator forms must be supported.

### Acceptance Criteria

- Trellis has one clear validator contract model.
- Public APIs stop leaking multiple subtly different validator concepts where one would do.

### Verification

- [x] Add type tests covering validator input and output resolution across operations and MCP tools.
- [x] Add contract tests for at least one cross-surface validator reuse path.
- [x] `pnpm run test:types` passes after validator unification.

Note:

- The canonical validator contract for this pass is the existing `defineArgs(...)` / `SchemaDefinition` surface plus Standard Schema normalization in `resolve-validator`. No second validator DSL was introduced.

## Workstream 8: Transport Serializability Typing

### Goal

Make serializability rules explicit and compile-time checked at transport boundaries.

### Implementation Steps

- [x] Add a `ValidateSerializable<T>` style helper for transport-safe payloads.
- [x] Apply it to MCP result and preview surfaces.
- [x] Apply it to destructive preview confirmation payloads.
- [x] Apply it to other high-value transport seams where the payload is meant to cross process or protocol boundaries.
- [x] Avoid overextending the rule into purely internal runtime objects.

### Acceptance Criteria

- Transport-bound payload types are checked explicitly for serializability.
- Important seams stop degrading to `unknown` or `Record<string, unknown>` unnecessarily.

### Verification

- [x] Add type tests for accepted serializable payloads.
- [x] Add negative tests for clearly non-serializable payloads.
- [x] `pnpm run test:types` passes after serializability typing lands.

## Workstream 9: Public Type Primitives

### Goal

Expose a small public helper layer for the hardest APIs so users do not have to reverse-engineer internal generics.

### Implementation Steps

- [x] Add a dedicated public type-primitives surface.
- [x] Start with the smallest useful set, such as:
  - `ValidateOperationId`
  - `ValidateOperationProjection`
  - `ValidatePermissionKey`
  - `ValidateCapabilityKey`
  - `ValidateToolArgs<TSchema, TArgs>`
  - `InferOperationResult`
  - `InferPermissionContext`
  - `ValidateMcpToolOptions`
- [x] Export only helpers that are stable enough to support intentionally.
- [x] Avoid exporting raw internal scaffolding types accidentally.
- [x] Update docs to point advanced users at the public helper layer.

### Acceptance Criteria

- Users have a supported helper layer for validating ids and options against the registered type surface.
- The public API becomes easier to explain and test.

### Verification

- [x] Add public-entrypoint type tests for each exported helper.
- [x] Verify helpers compile against registry-driven ids and generated maps.
- [x] `pnpm run check:publish-surface` passes after the new exports are added.
- [x] `pnpm run test:types` passes after the helper layer is added.

## Workstream 10: Public-Entrypoint DTS Suite

### Goal

Test the shipped Trellis type surface as consumers see it, not just the internal source files.

### Implementation Steps

- [x] Add a `tests/dts/` suite for public package entrypoints.
- [x] Import only published Trellis entrypoints in the new suite.
- [x] Prefer `expectTypeOf(...)` for new type specs.
- [x] Keep `@ts-expect-error` only for explicit negative cases.
- [x] Add a dedicated type-test execution path so the `dts` suite runs as a first-class verification surface rather than an incidental `tsc` side effect.
- [x] Retain the existing `tests/types` suite while migrating high-value cases into the public-entrypoint suite.

### Acceptance Criteria

- Trellis verifies its published type surface directly.
- Type tests read like public API specs rather than internal implementation probes.

### Verification

- [x] Create initial `tests/dts/auth.test-d.ts`, `functions.test-d.ts`, `mcp.test-d.ts`, and `testing.test-d.ts`.
- [x] Confirm the new suite compiles against public entrypoints only.
- [x] Confirm the dedicated type-test execution path is wired into the repo verification flow.
- [x] `pnpm run test:types` passes with the new suite included.

## Workstream 11: Generated-Type Consumer Verification

### Goal

Treat generated types as shipped API and verify them as consumer contracts.

### Implementation Steps

- [x] Snapshot generated permission type output.
- [x] Snapshot generated operation and tool lookup-map output if added in this plan.
- [x] Add fixture projects that compile against generated type output.
- [x] Add fixture coverage for generated Nuxt-facing type augmentations.
- [x] Ensure the generated output is verified both as text and as consumer-usable types.

### Acceptance Criteria

- Generated declarations are verified at the same level as handwritten public types.
- A generated file that looks plausible but breaks consumer DX fails the verification gate.

### Verification

- [x] Add fixture compile tests for permission codegen output.
- [x] Add fixture compile tests for Nuxt augmentation output.
- [x] `pnpm run test:contracts` passes with generated-output verification included.
- [x] `pnpm run test:types` passes with generated consumer fixtures.

## Workstream 12: Multi-Version Type Compatibility

### Goal

Make TypeScript compatibility an explicit policy instead of an incidental side effect.

### Implementation Steps

- [x] Decide the minimum supported TypeScript version range for this pass.
- [x] Add explicit compatibility verification for at least the lower bound and current supported version.
- [x] Scope this narrowly to the public type surface rather than every test project if needed.
- [x] Keep the workflow cheap enough to be sustainable in CI.

### Acceptance Criteria

- Trellis knows which TypeScript versions its public type surface is meant to support.
- Type compatibility is verified intentionally.

### Verification

- [x] Add the selected compatibility checks to CI or release verification.
- [x] Document the supported TypeScript range in the package or docs if it changes.
- [x] `pnpm run check` still passes with the added compatibility policy.

## Workstream 13: Docs And Advanced Guidance

### Goal

Teach the improved TypeScript surface intentionally rather than leaving users to infer it from implementation details.

### Implementation Steps

- [x] Update API surface docs for any changed operation or MCP builder shapes.
- [x] Add guidance on public helper types where they materially help advanced users.
- [x] Update examples if the new type architecture changes recommended authoring style.
- [x] Document registries and generated type output where that becomes part of the supported model.
- [x] Keep docs focused on what users should rely on, not on internal scaffolding.

### Acceptance Criteria

- Docs, examples, and types all teach the same supported model.
- Advanced users have a supported path that does not require reading source internals.

### Verification

- [x] `pnpm run check:docs:api-surface` passes.
- [x] `pnpm run check:docs:links` passes.
- [x] Manual spot-check of advanced TS docs against actual public exports is complete.

## Workstream 14: Release Readiness

### Goal

Confirm the TypeScript refactor is complete and the published API is stronger, simpler, and better verified.

### Release Gates

- [x] Public operation, projection, and tool typing is registry-driven where planned.
- [x] Projection identity mismatches fail at compile time in the supported API.
- [x] The heaviest public type surfaces bind key type facts earlier than before.
- [x] Shared utility types are centralized and duplicated local helpers are reduced.
- [x] Public helper types exist for the hardest supported surfaces.
- [x] A public-entrypoint `dts` suite exists and passes.
- [x] Generated type output is consumer-compiled in fixtures.
- [x] Docs and examples reflect any public authoring changes.

### Final Verification

- [x] `pnpm run check`
- [x] `pnpm run test:contracts`
- [x] `pnpm run test:examples`
- [x] `pnpm run test:types`

### Done Means Done

- [x] The public Trellis type surface is easier to consume than before.
- [x] The public Trellis type surface is more strongly verified than before.
- [x] No open blocker remains for shipping the improved TypeScript contract.

## Deferred Work

These are intentionally out of scope for this checklist unless explicitly promoted later:

- [x] a large feature-authoring DSL remains explicitly deferred
- [x] permanent public dual-path APIs for both old and new builder shapes remain explicitly deferred
- [x] broad export of internal inference scaffolding remains explicitly deferred
- [x] framework-specific type surface redesign outside Trellis’s supported package entrypoints remains explicitly deferred
- [x] any TypeScript work that reopens the ratified Trellis v1 product architecture remains explicitly deferred

These deferred items should only be reopened by explicit scope change after this checklist.
