# Phase 0 Next Major Experiments

Status: go for alpha foundation; see `meta/experiments/phase0-go-no-go.md`
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

Follow-up result:

Go for real fixture generation. The fixture now runs through real Convex local
deployment codegen and Nuxt build. The generated Trellis helper wraps
`convex/_generated/api` refs instead of fake refs, while the MCP tool still
imports only shared descriptors and generated refs. One boundary issue surfaced
and was fixed: shared/Convex fixture files must import focused runtime modules,
not broad barrels that can drag server-only code into the Convex bundle.

Starter boundary result:

Go for manifest-backed generation. `starter.manifest.json` now marks the files
that may become starter output and keeps local deployment/build artifacts out of
the starter source.

Generated ref result:

Go for a small internal renderer. The fixture's `generated/operation-refs.ts`
shape is now reproducible from explicit descriptor/API metadata through
`renderOperationRefsModule(...)`. This proves the checked-binding fallback can be
generated without source scanning or importing Convex implementation modules
into MCP server files. Full CLI starter wiring remains out of scope for this
experiment.

Remaining proof:

- wire the generated-ref renderer into the actual starter generation path;
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

Test-vector result:

Go for canonical hash stabilization. Phase 0 now records fixed canonical args
and SHA-256 base64url hash vectors in the forwarding RFC skeleton, and the unit
suite asserts those vectors against the spike implementation. This still does
not freeze the production algorithm; it gives the RFC a concrete baseline to
accept or replace.

Benchmark result:

Go for baseline tracking. `node scripts/bench-forwarding-envelope.mjs` measures
the Phase 0 HMAC verification spike without making the result a flaky unit-test
gate. Local result on 2026-05-09: p50 0.0077ms, p95 0.013ms, p99 0.0236ms over
20,000 verifications. The production RFC can keep this target or replace it if
the final algorithm changes.

Remaining proof:

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

Follow-up result:

Go for starter integration. A real Nuxt build accepts the runtime/tool shape once
the fixture exports the MCP runtime as the default handler expected by
`@nuxtjs/mcp-toolkit`.

Direct mutation safety result:

Go for generated metadata. Direct MCP mutation tools now require `bounded-write`
safety on both the tool declaration and the backend/generated ref. Sensitive,
destructive, and external-side-effect writes must use operations. The
`phase0-workspace-mcp` fixture includes a direct `create-project` mutation whose
generated ref gets safety from a shared `defineMcpToolRefDescriptor(...)`
descriptor through `projectMcpToolRef(...)`, not from the MCP tool file alone.
The helper remains on the focused operation-binding module path during Phase 0;
it is not a public barrel API decision.

Remaining proof:

- wire the pattern into the future fixture-backed `workspace-mcp` starter
  generator;
- keep `tool.fromOperation(...)` until the major migration codemod lands.
