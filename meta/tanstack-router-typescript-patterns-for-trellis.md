# TanStack Router TypeScript Patterns For Trellis

**Scope:** Compare TanStack Router’s TypeScript design with Trellis and extract the highest-leverage patterns Trellis can adopt.

**Inputs:** Direct source review of Trellis and TanStack Router, plus three delegated passes focused on API ergonomics, utility-type architecture, and type verification strategy.

## Executive Summary

TanStack Router is not exceptional because it has more complex types. It is exceptional because it uses a disciplined system:

1. It pushes app-specific facts into registries.
2. It generates those registries instead of inferring everything ad hoc.
3. It binds important literals and context early.
4. It centralizes a small set of utility types.
5. It aggressively type-tests the public surface and generated output.

Trellis already has one strong proof point for this approach with `RegisteredPermissions` in [src/runtime/auth/define-permission.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/auth/define-permission.ts:20) and generated augmentation in [src/module-internals/permissions-codegen.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/module-internals/permissions-codegen.ts:266). The main gap is that the same discipline is not applied consistently across operations, MCP tools, projections, generated Nuxt types, and public type verification.

The highest-value takeaway is simple: Trellis should stop asking the type system to recover facts from large object literals and callback signatures after the fact. TanStack gets its DX by registering facts earlier and then letting the rest of the API index into those facts.

## Current Trellis Strengths

- Registry-based permission typing already exists through [src/runtime/auth/define-permission.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/auth/define-permission.ts:20) and [src/module-internals/permissions-codegen.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/module-internals/permissions-codegen.ts:266).
- `createConfiguredPermissionsComposables` has a good registry-aware narrowing model in [src/runtime/composables/configured-permissions.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/composables/configured-permissions.ts:23).
- The observability event model already uses a good “map first, derived union second” pattern in [src/runtime/observability/types.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/observability/types.ts:83).
- Trellis already does some type contract testing in [tests/types](/Users/matthias/Git/0_libs/WORK/trellis/tests/types) and publish-surface checks in [package.json](/Users/matthias/Git/0_libs/WORK/trellis/package.json:84).

These are good foundations. The issue is uneven application.

## What TanStack Router Is Actually Doing

### 1. Open registries plus declaration merging

TanStack keeps `Register` intentionally open in [packages/router-core/src/router.ts](/Users/matthias/Git/external/tanstack-router/packages/router-core/src/router.ts:115), then reads app/framework state back through helpers like `RegisteredRouter`. Framework packages augment stable seams, for example in [packages/react-router/src/route.tsx](/Users/matthias/Git/external/tanstack-router/packages/react-router/src/route.tsx:51).

Why it works:

- The core library stays stable.
- App-specific types are injected once.
- Later APIs read from registries instead of re-inferring from arbitrary user code.

### 2. Generated lookup maps

TanStack’s generator emits concrete maps like `FileRoutesByPath`, `FileRoutesByFullPath`, `FileRoutesById`, and `FileRouteTypes`, then feeds them back into the public API. You can see the generated shape in [packages/router-generator/tests/generator/flat/routeTree.snapshot.ts](/Users/matthias/Git/external/tanstack-router/packages/router-generator/tests/generator/flat/routeTree.snapshot.ts:81) and the underlying generator in [packages/router-generator/src/generator.ts](/Users/matthias/Git/external/tanstack-router/packages/router-generator/src/generator.ts:845).

Why it works:

- Literal unions are exact.
- Public helpers like `createFileRoute('/posts/$id')` are precise without asking users to thread generic arguments manually.
- The system scales because the source of truth is generated, not reconstructed.

### 3. Earlier generic capture

TanStack often binds the important type fact in an earlier call boundary, for example `createFileRoute(path)(options)` in [packages/react-router/src/fileRoute.ts](/Users/matthias/Git/external/tanstack-router/packages/react-router/src/fileRoute.ts:49) and `createRootRouteWithContext<Ctx>()` in [packages/react-router/src/route.tsx](/Users/matthias/Git/external/tanstack-router/packages/react-router/src/route.tsx:428).

Why it works:

- The literal or context type is fixed before the large options object is validated.
- Later properties cannot accidentally widen earlier choices.
- The user sees simpler errors.

### 4. Small, centralized utility-type kernel

TanStack centralizes reusable helpers like `NoInfer`, `Expand`, `Assign`, `UnionToIntersection`, `Constrain`, and `ConstrainLiteral` in [packages/router-core/src/utils.ts](/Users/matthias/Git/external/tanstack-router/packages/router-core/src/utils.ts:5). It then uses them consistently across the router and start packages.

Why it works:

- Utility logic is uniform.
- Public helpers are built on a known vocabulary.
- Type complexity is concentrated instead of leaking into every module independently.

### 5. Hidden type carriers for staged builders

TanStack Start uses hidden `~types` carriers to preserve resolved input, output, and context across multi-step builders in [packages/start-client-core/src/createMiddleware.ts](/Users/matthias/Git/external/tanstack-router/packages/start-client-core/src/createMiddleware.ts:110) and [packages/start-client-core/src/createStart.ts](/Users/matthias/Git/external/tanstack-router/packages/start-client-core/src/createStart.ts:13).

Why it works:

- Later stages do not have to reverse-engineer earlier generic decisions from function signatures.
- Builder chains remain precise without exploding inference cost.

### 6. Public type-primitives instead of exposing raw internals

TanStack exports narrow, user-facing helpers like `ValidateNavigateOptions`, `ValidateId`, and related primitives from [packages/router-core/src/typePrimitives.ts](/Users/matthias/Git/external/tanstack-router/packages/router-core/src/typePrimitives.ts:15) and [packages/react-router/src/typePrimitives.ts](/Users/matthias/Git/external/tanstack-router/packages/react-router/src/typePrimitives.ts:17).

Why it works:

- Users validate intent against registries without understanding internal generic stacks.
- API docs can point to a small helper instead of a full implementation signature.

### 7. Type verification as a first-class product surface

TanStack has broad `*.test-d.ts[x]` coverage and uses `expectTypeOf(...)` extensively. Representative examples:

- [packages/start-client-core/src/tests/createServerFn.test-d.ts](/Users/matthias/Git/external/tanstack-router/packages/start-client-core/src/tests/createServerFn.test-d.ts:20)
- [packages/react-router/tests/fileRoute.test-d.tsx](/Users/matthias/Git/external/tanstack-router/packages/react-router/tests/fileRoute.test-d.tsx:1)
- [packages/router-core/tests/remountDeps.test-d.ts](/Users/matthias/Git/external/tanstack-router/packages/router-core/tests/remountDeps.test-d.ts:1)

Generated output is also verified both as text and as consumer-facing types.

Why it works:

- Regressions are caught where users feel them.
- Generated types are treated as shipped API, not internal implementation detail.

## Where Trellis Is Weaker Today

### 1. Too much inference is recovered late from flat object literals

Heavy generic surfaces like [src/runtime/functions/define-operation.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/functions/define-operation.ts:73) and [src/runtime/functions/define-handler.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/functions/define-handler.ts:52) reconstruct context, principal, delegation, actor, loaded value, and results from callback shapes.

Consequence:

- More conditional extraction logic.
- More fallback heuristics.
- Worse editor readability.
- Higher risk that a new option accidentally widens the whole API.

### 2. Operation and MCP typing still rely too much on runtime assertions

`tool.fromOperation(...)` still depends on runtime validation in [src/runtime/mcp/operation-binding.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/mcp/operation-binding.ts:23) because operation identities and execute/preview projections are not registered as first-class type data.

Consequence:

- The type system cannot fully protect projection mismatches.
- Runtime checks are doing work that should mostly be compile-time.

### 3. Utility types are repeated instead of centralized

Trellis has local helpers and repeated conditional extraction in:

- [src/runtime/functions/define-operation.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/functions/define-operation.ts:73)
- [src/runtime/convex/shared/convex-shared.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/convex/shared/convex-shared.ts:132)
- [src/runtime/observability/types.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/observability/types.ts:186)

Consequence:

- Similar problems are solved multiple times.
- Public surfaces do not share a stable type vocabulary.

### 4. Generated types are not verified as consumer contracts strongly enough

Trellis generates permissions and Nuxt-facing augmentations, but these are not tested with the same rigor TanStack uses for generated route types. Relevant files:

- [src/module-internals/permissions-codegen.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/module-internals/permissions-codegen.ts:266)
- [src/installers/core.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/installers/core.ts:23)
- [tests/unit/permissions-codegen.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/unit/permissions-codegen.test.ts:22)

Consequence:

- Emitted text may look correct while consumer DX still regresses.

### 5. Type verification is still too internal-facing

Trellis’s `tests/types` suite is useful, but it mostly imports source files directly:

- [tests/types/dx-typing.types.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/types/dx-typing.types.ts:1)
- [tests/types/component-bridge.types.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/types/component-bridge.types.ts:1)
- [tests/types/mcp-runtime.types.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/types/mcp-runtime.types.ts:1)

Consequence:

- Internal generics can keep compiling while the published entrypoints or emitted declarations drift.

## Highest-Value Patterns Trellis Should Adopt

## 1. Generalize `RegisteredPermissions` into a broader registry system

**Recommendation**

Extend the existing permission codegen pattern into ambient registries such as:

- `RegisteredOperations`
- `RegisteredOperationProjections`
- `RegisteredTools`
- `RegisteredCapabilities`

**Trellis targets**

- Existing foundation: [src/runtime/auth/define-permission.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/auth/define-permission.ts:20)
- Existing codegen model: [src/module-internals/permissions-codegen.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/module-internals/permissions-codegen.ts:266)
- Problem area: [src/runtime/mcp/operation-binding.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/mcp/operation-binding.ts:23)

**Why**

- This is the biggest leverage move.
- It shifts Trellis from “recover types later” to “register types once.”
- It gives future helper APIs something concrete to index into.

**Hard-cut implication**

Do not add compatibility shims around old runtime-only identification paths if you adopt this. Replace them.

## 2. Generate lookup maps for operations and projections

**Recommendation**

Generate concrete maps such as:

- `OperationsById`
- `OperationExecutionsById`
- `OperationPreviewsById`
- `ToolsByName`

**Why**

- Generated maps eliminate stringly-typed late validation.
- They make operation projections exact in the same way TanStack makes route paths exact.

**Trellis targets**

- [src/runtime/functions/define-operation.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/functions/define-operation.ts:206)
- [src/runtime/mcp/define-mcp-app.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/mcp/define-mcp-app.ts:215)

## 3. Move heavy APIs to identity-first or context-first factories

**Recommendation**

Adopt earlier generic capture for the heaviest surfaces. Examples:

- `createOperationFactory<TCtx>()(definition)`
- `defineOperation.withContext<TCtx>()(...)`
- `defineTool.fromSchema(schema)(options)`

**Why**

- It binds `TCtx` or `schema` before the large options object is typed.
- It reduces late inference recovery and produces clearer diagnostics.

**Trellis targets**

- [src/runtime/functions/define-operation.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/functions/define-operation.ts:73)
- [src/runtime/functions/define-handler.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/functions/define-handler.ts:52)
- [src/runtime/mcp/define-mcp-app.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/mcp/define-mcp-app.ts:119)

**Caution**

Only do this if it is a real hard cut. Do not keep both a flat-object API and a new factory API indefinitely.

## 4. Brand operation projections and stop depending on runtime-only projection checks

**Recommendation**

Introduce a branded type like:

`OperationProjectionRef<TId, 'execute' | 'preview'>`

Then require `tool.fromOperation(...)` to accept those branded refs rather than raw `AnyFunctionRef`.

**Why**

- Projection identity becomes compile-time data.
- Runtime assertion in [src/runtime/mcp/operation-binding.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/mcp/operation-binding.ts:23) becomes a safety net instead of the primary mechanism.

## 5. Add a single shared `type-utils.ts`

**Recommendation**

Create one shared utility module with a minimal, stable set:

- `NoInfer`
- `Expand` or `Simplify`
- `Assign`
- `UnionToIntersection`
- `IsUnknown`

Optional only if genuinely reused:

- `WithoutEmpty`
- `Constrain`
- `ConstrainLiteral`

**Why**

- Trellis currently repeats utility logic in multiple modules.
- A shared vocabulary will simplify refactors and public helper design.

**Trellis targets**

- [src/runtime/functions/define-operation.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/functions/define-operation.ts:73)
- [src/runtime/convex/shared/convex-shared.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/convex/shared/convex-shared.ts:132)
- [src/runtime/observability/types.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/observability/types.ts:186)

## 6. Introduce hidden type carriers for staged builders

**Recommendation**

Where Trellis exposes staged builders, preserve resolved types through hidden metadata such as `~types` instead of repeatedly inferring from handler signatures.

Most obvious targets:

- structured handlers
- operation builders
- MCP tool builders

**Why**

- It reduces the repeated `Infer*` chain in [src/runtime/functions/define-operation.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/functions/define-operation.ts:96)
- It should improve maintainability and editor performance.

## 7. Normalize validator typing around one protocol

**Recommendation**

Treat the schema system in [src/runtime/convex/shared/define-convex-schema.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/convex/shared/define-convex-schema.ts:42) as the canonical validator boundary across functions, MCP, and related runtime surfaces.

Export protocol-level helpers similar in spirit to TanStack’s `ResolveValidatorInput` and `ResolveValidatorOutput`.

**Why**

- Trellis currently drops back to raw `PropertyValidators` and `ObjectType<T>` in too many places.
- One validator protocol will shrink public surface complexity.

## 8. Add compile-time serializability enforcement at transport seams

**Recommendation**

Introduce a `ValidateSerializable<T>` helper and enforce it at transport boundaries, especially:

- MCP responses
- destructive preview confirmation payloads
- trusted-forwarding payloads
- observability envelope details

**Trellis targets**

- [src/runtime/mcp/types.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/mcp/types.ts:21)
- [src/runtime/mcp/define-mcp-app.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/mcp/define-mcp-app.ts:138)

**Why**

- Today several important seams still devolve to `unknown` or `Record<string, unknown>`.
- Transport safety should be explicit and compile-time checked.

## 9. Publish public `Validate*` and `Infer*` primitives

**Recommendation**

Add a small public `type-primitives.ts` for the hardest surfaces. Candidates:

- `ValidateOperationId`
- `ValidateOperationProjection`
- `ValidatePermissionKey`
- `ValidateCapabilityKey`
- `ValidateToolArgs<TSchema, TArgs>`
- `InferOperationResult`
- `InferPermissionContext`
- `ValidateMcpToolOptions`

**Why**

- It lets users interact with stable helpers rather than internal implementation signatures.
- It mirrors one of TanStack’s strongest DX practices.

## 10. Upgrade the type verification strategy

**Recommendation**

Build a real public-entrypoint `dts` suite and keep the existing `tsc` contract pass.

Specifically:

1. Add `tests/dts/auth.test-d.ts`, `functions.test-d.ts`, `mcp.test-d.ts`, and `testing.test-d.ts`.
2. Import only public entrypoints such as `@lupinum/trellis/auth` and `@lupinum/trellis/functions`.
3. Prefer `expectTypeOf(...)` to custom `Assert<IsEqual<...>>` for new tests.
4. Snapshot generated type output and then compile it in consumer fixtures.
5. Validate generated Nuxt augmentation output in a fixture app.

**Why**

- TanStack treats types as product surface, not just implementation.
- Trellis’s current tests prove internals, but not enough of the shipped package contract.

## Prioritized Rollout

### Phase 1: Highest leverage, lowest controversy

1. Create `src/runtime/types/type-utils.ts`.
2. Add public-entrypoint `tests/dts/*`.
3. Convert new type tests to `expectTypeOf(...)`.
4. Add consumer-compile coverage for generated permission and Nuxt types.

### Phase 2: Structural improvements

1. Generalize permission-style registries to operations, projections, and tools.
2. Add branded projection refs.
3. Publish a minimal `type-primitives.ts`.

### Phase 3: API redesign

1. Hard-cut heavy generic surfaces to earlier-binding factory APIs.
2. Introduce hidden type carriers for staged builders.
3. Normalize validator protocols across functions and MCP.

## What Trellis Should Not Copy

- Do not copy TanStack’s deprecated parallel class/function APIs. Pick one shape and cut over.
- Do not add shims, adapters, dual paths, or long-lived compatibility layers if you redesign the heavy APIs.
- Do not blindly import TanStack’s whole helper set. A small, disciplined utility kernel is the point.
- Do not keep adding deeper `infer` chains as a substitute for registries and codegen.
- Do not use `Record<string, unknown>` as a default escape hatch at important API boundaries when more precise typing is possible.
- Do not spread `Expand` or `Simplify` everywhere. Use them surgically on user-facing result types and hover surfaces.

## Concrete First Targets

If Trellis wants a short list of the best first candidates, they are:

1. [src/runtime/functions/define-operation.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/functions/define-operation.ts:73)
   This is the clearest case of late inference recovery and should be the main design target.
2. [src/runtime/mcp/define-mcp-app.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/mcp/define-mcp-app.ts:119)
   This is where registries, branded projections, and earlier schema binding would pay off quickly.
3. [src/runtime/composables/configured-permissions.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/composables/configured-permissions.ts:23)
   This is already one of the strongest TS surfaces and should be used as a model for registry-driven APIs.
4. [src/runtime/functions/create-component-bridge.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/functions/create-component-bridge.ts:57)
   Good candidate for public-entrypoint type tests and public helper primitives.
5. [src/installers/core.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/installers/core.ts:23)
   Generated augmentations should be treated as shipped type surface and validated accordingly.

## Final Take

The right lesson from TanStack Router is not “write more advanced types.” The lesson is:

- register earlier
- generate more
- centralize utility types
- expose small public primitives
- test the shipped type surface aggressively

If Trellis follows that pattern, the result should be both simpler and stronger. That is the real benchmark TanStack sets.
