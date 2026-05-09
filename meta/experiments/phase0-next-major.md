# Phase 0 Next Major Experiments

Status: started
Branch: `trellis-next-phase0`
Date: 2026-05-09

This note records Phase 0 spikes for the Trellis next-major plan. These are not
API-freeze decisions. They prove whether the proposed boundaries can work
without moving the whole framework at once.

## Experiment: Operation Descriptors And Inventory

Question:

Can shared descriptors describe cross-surface operation metadata while Convex
implementations keep backend behavior?

Implemented:

- `defineOperationDescriptor(...)`
- `implementOperation(descriptor, implementation)`
- `definePermissionKey(...)`
- feature operations in `composeFeatures(...)`
- `defineAppInventory(...)`
- versioned `toAppInventoryJson(...)`

Current result:

Go for continued Phase 0. The descriptor shape can bind to the existing
operation metadata and projection-ref system without a parallel runtime. The
`phase0-workspace-mcp` fixture now proves the intended source-of-truth chain:
shared descriptor, Convex implementation, generated-style projection refs, MCP
tool import, and app inventory JSON.

Remaining proof:

- prove generated Convex refs can carry enough projection metadata for MCP
  server files after real Convex codegen, not only generated-style test refs;
- decide whether descriptors or generated handles are the canonical MCP import.

## Experiment: Signed Forwarding Envelope

Question:

Can a signed envelope replace raw trusted-forwarding args without making normal
server/MCP/bridge code understand signing details?

Implemented:

- deterministic args canonicalization with `_trellisForwarding` and `__trellis`
  excluded;
- base64url SHA-256 args hash;
- compact JWS-like HMAC envelope;
- verification for signature, issuer, audience, function ref, args hash, expiry,
  unknown key id, and replay redemption.

Current result:

Go for RFC development, not production implementation. The technical shape is
small enough to keep isolated, but signing algorithm, key rotation, replay store,
test vectors, and principal/delegation validators still need the security RFC.

Remaining proof:

- add RFC test vectors;
- benchmark verification after the signing algorithm is chosen;
- wire the envelope through server/MCP/bridge callers behind one helper;
- keep old raw forwarding path until the migration slice is ready.

## Experiment: Operation-First MCP Authoring

Question:

Can Trellis start teaching `mcp.tool.operation(...)` before deleting the old
`tool.fromOperation(...)` path?

Implemented:

- non-breaking `mcp.tool.operation(...)` alias backed by the existing checked
  operation binding path.

Current result:

Go for examples and fixture work. The alias works with both operation
implementations and shared descriptors plus projected refs. The fixture keeps the
MCP server tool free of Convex implementation imports.

Remaining proof:

- add direct `query`/`mutation` lane safety metadata;
- run the pattern in a generated `workspace-mcp` starter, not only a focused
  fixture;
- keep `tool.fromOperation(...)` until the major migration codemod lands.
