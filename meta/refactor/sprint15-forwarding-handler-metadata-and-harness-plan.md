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

- Inventory every path that injects or accepts trusted-forwarding validators.
- Cover public, protected, unsafe, internal, action, and test helper surfaces.
- Identify whether each path has exact `trustedForwardingFunctionRef` metadata, derives it from generated metadata, or currently lacks it.
- Add or update a small test matrix so this does not depend on source scanning or memory.

### 2. Enforce Exact Function Ref For Forwarding-Protected Handlers

- Forwarding-protected handlers must verify the envelope `functionRef` against exact builder/generated metadata.
- A handler that accepts `_trellisForwarding` without exact expected function-ref metadata must fail closed or be explicitly marked as non-forwarding.
- Keep enforcement in the backend/trusted-forwarding boundary, not in MCP or frontend orchestration.
- Add unit tests for success and failure across the relevant handler surfaces.

### 3. Fix Harness Signed Forwarding Proof

- Replace placeholder `functionRef: 'harness:test'` signing in `apps/harness/convex/test.helpers.ts`.
- Sign each test call with the actual generated Convex ref, such as the functions probe and organization mutation refs.
- Preserve app args exactly and keep principal/delegation only inside `_trellisForwarding`.
- Make the focused harness Convex tests pass without loosening verifier behavior.

### 4. Audit Operation Execute Replay Source Of Truth

- Inspect the MCP backend-mode destructive path and Convex destructive execution path.
- Confirm there is one authoritative redemption point for `operation-execute`.
- If replay redemption is split between a preflight check and later execution, move the invariant to the backend/destructive execution boundary or add a failing test plus a follow-up blocker.
- Do not add a second replay table or store.

### 5. Document Remaining Generated-Code Follow-Up

- If generated Ginko Convex files still include old raw forwarding validator types, document regeneration as the fix.
- Do not manually patch generated files.
- Ensure source/templates/tests remain raw-free except for negative tests and canonical args hash metadata-exclusion cases.

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

- Every handler accepting `_trellisForwarding` verifies an exact expected function ref or fails closed.
- Harness signed forwarding actor/delegation tests pass with exact function refs.
- No active runtime source supports raw `_trustedForwardingKey` or raw `_trustedForwarding` fallback.
- Operation-execute replay has one documented source of truth, backed by a test or an explicit blocker.
- Ginko source/templates/tests remain compatible with signed-only forwarding.
- Verification commands above pass, except explicitly listed unrelated type drift.
- Sprint changes are committed after verification.
