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
operation metadata and projection-ref system without a parallel runtime.

Remaining proof:

- run against a generated or fixture `workspace-mcp` app;
- prove generated Convex refs can carry enough projection metadata for MCP
  server files without importing Convex implementation modules;
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

Go for examples and fixture work. This is only an authoring alias today; it does
not yet prove descriptor-only imports or final destructive annotations.

Remaining proof:

- bind `mcp.tool.operation(descriptor, { preview, execute })` without importing
  Convex implementation modules;
- add direct `query`/`mutation` lane safety metadata;
- update a `workspace-mcp` fixture to use the new spelling;
- keep `tool.fromOperation(...)` until the major migration codemod lands.
