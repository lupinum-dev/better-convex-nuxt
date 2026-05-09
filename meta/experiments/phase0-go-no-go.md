# Phase 0 Go/No-Go Note

Date: 2026-05-09
Branch: `trellis-next-phase0`
Status: go for alpha foundation, not API freeze

## Decision

Phase 0 can move forward into alpha-foundation work.

The core next-major boundary is viable: shared descriptors can describe
cross-surface operation and direct-tool metadata while Convex implementation
modules keep backend behavior. MCP server files can import shared descriptors
and generated refs without importing Convex implementation code.

This is not approval to remove old public APIs yet. `tool.fromOperation(...)`,
raw trusted-forwarding migration, import-path decisions, and public builder
syntax still belong to the major migration/API-freeze phase.

## Go

### Operation Descriptors And Inventory

Go.

Proved by:

- `defineOperationDescriptor(...)`;
- `implementOperation(descriptor, implementation)`;
- `definePermissionKey(...)`;
- feature manifest operations;
- `defineAppInventory(...)`;
- versioned `toAppInventoryJson(...)`;
- `phase0-workspace-mcp` fixture using shared descriptor, Convex
  implementation, generated-style refs, MCP tool imports, and inventory JSON.

Acceptance evidence:

- focused unit tests pass;
- real Convex local deployment codegen passes;
- Nuxt fixture build passes;
- MCP tool files do not import `convex/features/**`.

### Checked Operation Ref Generation

Go.

The fallback explicit MCP operation shape is reproducible from manifest metadata:

```ts
mcp.tool.operation(deleteProjectDescriptor, {
  execute: executeDeleteProjectRef,
  preview: previewDeleteProjectRef,
})
```

The generated refs are rendered from `starter.manifest.json` through the internal
starter fixture renderer. This proves the generated binding shape without
inventing the full CLI starter generator in Phase 0.

### Direct MCP Mutation Safety

Go for generated metadata.

Direct MCP mutation tools must declare `bounded-write` safety, and the
backend/generated ref must carry matching safety metadata. Sensitive,
destructive, and external-side-effect writes remain operation-only.

The fixture includes `create-project` as a direct bounded-write mutation. Its
generated ref gets safety from a shared `defineMcpToolRefDescriptor(...)`
descriptor through `projectMcpToolRef(...)`, not from the MCP tool file alone.

### Fixture-Backed Starter Boundary

Go.

`starter.manifest.json` explicitly lists included starter inputs and generated
files, and excludes local deployment/build artifacts. This is enough for Phase 0.
The actual CLI starter command remains future work.

### Signed Forwarding Envelope Shape

Go for RFC development, not production implementation.

The spike proves a compact JWS-like envelope with deterministic args hashing,
signature verification, issuer/audience/function/args checks, expiry checks, and
replay redemption hooks. The RFC skeleton now contains canonical hash vectors
and a local benchmark baseline.

This does not freeze the production signing algorithm.

## Partial / Not Yet Good Enough

### Forwarding Production Design

Not production-ready.

Still required before production implementation:

- RFC owner and security-aware reviewer;
- final signing algorithm decision;
- key rotation;
- principal and delegation validators;
- maximum envelope size;
- TTL/replay matrix;
- first-party replay/confirmation store path;
- helper wiring through server/MCP/bridge callers.

### CLI Starter Generation

Partial go.

The fixture renderer proves generated file shape and drift checks. The actual
fixture-backed starter generator is not implemented in Phase 0.

The CLI now accepts `--template workspace-mcp` as the first-class agent-enabled
workspace starter spelling while keeping `--template workspace --mcp` as an
alias. This is naming cleanup only; it does not yet make the CLI starter consume
the Phase 0 fixture manifest.

### Public API Naming

Not decided.

Still open:

- `@lupinum/trellis/backend` versus `@lupinum/trellis/functions`;
- `query.public(...)` / `mutation.protected(...)` versus guard-field spelling;
- descriptor imports versus generated handles as the canonical MCP operation
  import.

### Migration

Not started.

`tool.fromOperation(...)` remains present during Phase 0. The hard delete and
codemod belong to the next-major migration slice.

## Verification Commands

Current Phase 0 verification set:

```bash
pnpm exec vitest run --project=unit \
  tests/unit/operation-descriptor.test.ts \
  tests/unit/feature-compose.test.ts \
  tests/unit/trusted-forwarding-envelope.test.ts \
  tests/unit/trusted-forwarding.test.ts \
  tests/unit/define-convex-tool.test.ts \
  tests/unit/mcp-operation-binding.test.ts \
  tests/unit/phase0-workspace-mcp-fixture.test.ts \
  tests/unit/phase0-starter-manifest.test.ts \
  tests/unit/operation-ref-codegen.test.ts

pnpm --dir tests/fixtures/phase0-workspace-mcp exec convex codegen --typecheck=disable
pnpm --dir tests/fixtures/phase0-workspace-mcp exec nuxi build
pnpm run check:docs:api-surface
pnpm run check:publish-surface
node scripts/bench-forwarding-envelope.mjs
git diff --check
```

Known unrelated gap: `pnpm run test:types:contracts` still fails on existing
Nuxt alias/type issues around `#app` and plugin `nuxtApp` implicit `any`s.

## Recommendation

Proceed to alpha-foundation work with these constraints:

- keep descriptor/implementation separation;
- keep generated metadata as the source of MCP binding truth;
- do not expose new helper APIs from public barrels until naming/API decisions
  are made;
- do not start production forwarding implementation before RFC review;
- do not keep old and new public paths side by side without an explicit
  migration decision.
