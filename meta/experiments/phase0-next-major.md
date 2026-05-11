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

Starter fixture result:

Go for manifest-backed fixture generation. `renderStarterFixtureFiles(...)` can
now produce the `phase0-workspace-mcp` starter file set from
`starter.manifest.json`, respects excluded local artifacts, and renders
generated operation/MCP refs from manifest metadata instead of treating checked-in
generated text as canonical.

Remaining proof:

- wire the fixture-backed renderer into the actual `trellis init --template
workspace-mcp` path during the starter cutover sprint.

MCP import decision:

- shared descriptors are the canonical cross-surface operation/tool identity;
- generated refs are transport bindings that connect those descriptors to Convex
  API refs;
- MCP tool files import both: descriptors for meaning, generated refs for calls.

## Experiment: Signed Forwarding Envelope

Question:

Can a signed envelope replace raw trusted-forwarding args without making normal
server/MCP/bridge code understand signing details?

Implemented:

- deterministic args canonicalization with `_trellisForwarding`, legacy raw
  forwarding fields, reserved identity fields, and `__trellis` excluded;
- base64url SHA-256 args hash;
- compact JWS-like HS256 envelope;
- alpha key source from `CONVEX_TRUSTED_FORWARDING_KEY` with optional
  `CONVEX_TRUSTED_FORWARDING_KEY_ID`;
- alpha TTL defaults: query 60s, mutation/action 30s, operation-preview 30s,
  operation-execute 10s;
- verification for signature, issuer, audience, function ref, args hash, expiry,
  unknown key id, and replay redemption.
- `_trellisForwarding` accepted by trusted-forwarding validators and preferred
  over legacy raw forwarding fields;
- server trusted callers now sign app args into `_trellisForwarding` without
  exposing `principal` / `delegation` as public app args;
- legacy raw `_trustedForwardingKey` / `_trustedForwarding` remains supported for
  current callers.

Current result:

Go for alpha foundation, not production acceptance. The RFC now records HS256 as
the alpha baseline and names Matthias as owner, but production forwarding still
requires external security-aware review before public API freeze or migration.

Test-vector result:

Go for canonical hash stabilization. Phase 0 now records fixed canonical args
and SHA-256 base64url hash vectors in the forwarding RFC skeleton, and the unit
suite asserts those vectors against the spike implementation. This still does
not freeze the production algorithm; it gives the RFC a concrete baseline to
accept or replace.

Benchmark result:

Go for baseline tracking. `node scripts/bench-forwarding-envelope.mjs` measures
the Phase 0 HMAC verification spike without making the result a flaky unit-test
gate. Local result on 2026-05-09: p50 0.0079ms, p95 0.0128ms, p99 0.0463ms over
20,000 verifications. The production RFC can keep this target or replace it if
the final algorithm changes.

Remaining proof:

- keep generated destructive operation projections carrying function-ref
  metadata. Template audit found no additional starter templates creating these
  projections beyond the CLI resource generator and `phase0-workspace-mcp`
  fixture;
- keep the first-party production rate-limit path covered. The alpha path is
  `createRedisMcpRateLimitStore(...)` plus production fail-closed checks, doctor
  checks, and parallel-consume unit coverage. The operation-execute
  confirmation/replay store contract is the existing destructive safety table
  pair, now checked by doctor and runtime diagnostics;
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

- wire the pattern into the actual fixture-backed `workspace-mcp` starter cutover
  after `renderStarterFixtureFiles(...)` becomes the CLI init source;
- keep `tool.fromOperation(...)` until the major migration codemod lands.
