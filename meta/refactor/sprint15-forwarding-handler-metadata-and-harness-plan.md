# Sprint 15: Forwarding Handler Metadata And Harness Proof

## Goal

Finish the remaining signed-forwarding proof work from Slice 4 before starting the operation descriptor model.

By the end of this sprint, every forwarding-protected handler path should either verify an exact expected function ref or explicitly reject forwarding. The harness Convex tests should prove signed forwarding end to end without raw fallback, placeholder function refs, or identity-shaped public args.

## Why This Sprint Comes Next

Sprint 14 removed the raw trusted-forwarding runtime path. That was the right hard cut, but it left two proof gaps:

- `trustedForwardingFunctionRef` exists, but we have not proven it is complete across all forwarding-protected handler surfaces.
- The harness forwarding helpers still use a placeholder function ref, so the optional Convex harness tests are not a valid signed-forwarding proof.

Starting the operation descriptor model before closing these gaps would build new projection behavior on top of an incompletely proven forwarding boundary.

## Current State

- Signed-only trusted forwarding is committed.
- `_trellisForwarding` is the only active forwarding transport.
- Raw `_trustedForwardingKey` parsing and validation are deleted from runtime code.
- Server/MCP caller helpers sign envelopes by default.
- Ginko source no longer references raw forwarding fields.
- Ginko generated Convex component types may still mention raw fields until regeneration; do not edit generated files by hand.
- Full Trellis `pnpm run test:types` has unrelated repo type drift and is not a sprint acceptance gate unless fixed separately.

## Non-Goals

- Do not reintroduce raw trusted-forwarding fallback.
- Do not add compatibility shims for old forwarding fields.
- Do not start the Slice 5 operation descriptor implementation.
- Do not change the signing algorithm or forwarding RFC decisions.
- Do not complete bridge extraction.
- Do not freeze final public API naming.

## Work Items

### 1. Map Forwarding Handler Metadata

- [x] Inventory every path that injects or accepts trusted-forwarding validators.
- [x] Cover public, protected, unsafe, internal, action, and test helper surfaces.
- [x] Identify whether each path has exact `trustedForwardingFunctionRef` metadata, derives it from generated metadata, or currently lacks it.
- [x] Add or update a small test matrix so this does not depend on source scanning or memory.

### 2. Enforce Exact Function Ref For Forwarding-Protected Handlers

- [x] Forwarding-protected handlers must verify the envelope `functionRef` against exact builder/generated metadata.
- [x] A handler that accepts `_trellisForwarding` without exact expected function-ref metadata must fail closed or be explicitly marked as non-forwarding.
- [x] Keep enforcement in the backend/trusted-forwarding boundary, not in MCP or frontend orchestration.
- [x] Add unit tests for success and failure across the relevant handler surfaces.

### 3. Fix Harness Signed Forwarding Proof

- [x] Replace placeholder `functionRef: 'harness:test'` signing in `apps/harness/convex/test.helpers.ts`.
- [x] Sign each test call with the actual generated Convex ref, such as the functions probe and organization mutation refs.
- [x] Preserve app args exactly and keep principal/delegation only inside `_trellisForwarding`.
- [x] Make the focused harness Convex tests pass without loosening verifier behavior.

### 4. Audit Operation Execute Replay Source Of Truth

- [x] Inspect the MCP backend-mode destructive path and Convex destructive execution path.
- [x] Confirm there is one authoritative redemption point for `operation-execute`.
- [x] If replay redemption is split between a preflight check and later execution, move the invariant to the backend/destructive execution boundary or add a failing test plus a follow-up blocker.
- [x] Do not add a second replay table or store.

### 5. Document Remaining Generated-Code Follow-Up

- [x] If generated Ginko Convex files still include old raw forwarding validator types, document regeneration as the fix.
- [x] Do not manually patch generated files.
- [x] Ensure source/templates/tests remain raw-free except for negative tests and canonical args hash metadata-exclusion cases.

## Verification

Focused Trellis unit suite:

```bash
pnpm exec vitest run --project=unit \
  tests/unit/functions-defineTrellis.test.ts \
  tests/unit/trusted-forwarding.test.ts \
  tests/unit/trusted-forwarding-envelope.test.ts \
  tests/unit/server-convex-utils.test.ts \
  tests/unit/create-component-bridge.test.ts \
  tests/unit/define-convex-tool.test.ts \
  tests/unit/phase0-workspace-mcp-fixture.test.ts
```

Harness Convex proof:

```bash
pnpm run build:module
pnpm exec vitest run --project=convex \
  apps/harness/convex/functions.test.ts \
  apps/harness/convex/organizations.test.ts \
  apps/harness/convex/testing-package.test.ts
```

Required regression checks:

```bash
pnpm --dir examples/07-mcp-reference test
pnpm run test:types:bridge
pnpm run check:publish-surface
pnpm run check:docs:api-surface
pnpm run check:refactor:surface:inventory
pnpm run check:cli
node scripts/bench-forwarding-envelope.mjs
```

Ginko checks:

```bash
pnpm --dir ../ginko-cms run test:types
pnpm --dir ../ginko-cms run test:types:examples
```

Known non-gate unless fixed separately:

```bash
pnpm run test:types
```

Current unrelated failures include starter fixture codegen optional string drift, duplicate `vue-router` type drift between Trellis and Ginko dependency trees, and missing generated backend operation type exports.

## Acceptance Criteria

- [x] Every handler accepting `_trellisForwarding` verifies an exact expected function ref or fails closed.
- [x] Harness signed forwarding actor/delegation tests pass with exact function refs.
- [x] No active runtime source supports raw `_trustedForwardingKey` or raw `_trustedForwarding` fallback.
- [x] Operation-execute replay has one documented source of truth, backed by a test or an explicit blocker.
- [x] Ginko source/templates/tests remain compatible with signed-only forwarding.
- [x] Verification commands above pass, except explicitly listed unrelated type drift.
- [x] Sprint changes are committed after verification.

## Exit Notes

- [x] The harness exposed module-instance drift between package subpath imports and backend internals. Trusted-forwarding context keys now use `Symbol.for(...)` so verified context is readable across package subpath/runtime duplication.
- [x] Backend-mode MCP destructive execution no longer redeems in the MCP confirmation store. Transport mode still redeems in MCP; backend mode leaves redemption to Convex destructive execution.
- [x] `pnpm --dir ../ginko-cms run test:types` passes.
- [x] `pnpm --dir ../ginko-cms run test:types:examples` is not available in the Ginko workspace; the workspace currently exposes `test:types` and `typecheck`.
- [x] `pnpm --dir examples/07-mcp-reference test` passes.
- [x] `pnpm --dir examples/07-mcp-reference typecheck` remains non-gate because the example still has existing Nuxt alias/generated API and Convex dependency-version type drift.
