# Phase 0 Pre-Alpha Decisions

Date: 2026-05-09
Branch: `trellis-next-phase0`

This note records decisions that are safe to carry into alpha-foundation work.
It also names decisions that are intentionally not frozen yet.

## Accepted For Alpha Foundation

### MCP Operation Projection

Use explicit checked bindings for alpha:

```ts
mcp.tool.operation(deleteProjectDescriptor, {
  execute: executeDeleteProjectRef,
  preview: previewDeleteProjectRef,
})
```

Rationale:

- it keeps MCP server files from importing Convex implementation modules;
- it works with real Convex codegen;
- it gives doctor/inventory a concrete binding to check;
- it avoids betting Phase 0 on a one-line generated handle before codegen
  ordering is fully proven.

The future one-liner remains allowed only if it imports a generated/shared handle,
not a Convex implementation object.

### Operation Source Of Truth

Descriptor owns cross-surface metadata:

- operation id;
- operation kind;
- args;
- permission key;
- safety class;
- result/preview schemas where present.

Convex implementation owns behavior:

- guard;
- load;
- authorize;
- preview implementation;
- execute implementation.

Generated refs bind descriptor metadata to concrete Convex refs. MCP tools import
shared descriptors and generated refs.

### Direct MCP Mutation Safety

Direct MCP mutations are allowed only for `bounded-write`.

Safety must be present in two places:

- the MCP tool declaration;
- the backend/generated ref metadata.

The MCP tool declaration may confirm backend metadata. It may not down-classify
a sensitive/destructive/external-side-effect backend ref into `bounded-write`.

Sensitive writes, destructive writes, bulk writes, and external side effects use
operations.

### Fixture Generation

Fixture-backed starter generation uses an explicit manifest.

The manifest may list generated files, but generated output must be reproducible
from explicit metadata and covered by drift tests. Phase 0 does not add a broad
starter generator service.

### Workspace MCP Starter Name

`workspace-mcp` is the canonical alpha template spelling for the agent-enabled
workspace starter.

`workspace --mcp` remains an accepted CLI alias while the next-major starter
surface is being shaped. The alias is CLI sugar only; it is not a separate
starter source.

### Forwarding Envelope

The HMAC envelope remains a spike and benchmark baseline.

Production implementation waits for the forwarding RFC to decide:

- algorithm;
- key rotation;
- TTLs;
- replay policy;
- validators;
- production stores;
- error taxonomy.

## Not Frozen

### Public Backend Import Path

Open:

- `@lupinum/trellis/functions`;
- `@lupinum/trellis/backend`.

Recommendation for now: keep using focused internal module paths in fixtures and
avoid public-path churn until the public surface cleanup phase.

### Public Handler Builder Spelling

Open:

- `query.public(...)` / `mutation.protected(...)` / `mutation.unsafe(...)`;
- current object shape plus explicit public-access guard.

Recommendation for now: do not introduce the new spelling in Phase 0 fixtures.
The fixture is proving metadata and runtime boundaries, not final authoring API.

### Canonical Generated Handle Shape

Open:

- MCP tools import shared descriptors plus generated refs;
- MCP tools import a single generated operation handle.

Recommendation for alpha: keep descriptor plus generated refs. It is less
magical and already proven by the fixture.

### Migration Compatibility

Open:

- whether harmless import renames get hidden one-release aliases;
- exact codemod coverage;
- final removal table.

Constraint: do not preserve raw trusted-forwarding args or generic destructive
MCP paths as compatibility shims.
