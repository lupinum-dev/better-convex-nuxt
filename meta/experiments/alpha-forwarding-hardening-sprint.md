# Sprint: Forwarding Hardening And Operation Execute

Status: in progress
Branch: `trellis-next-phase0`
Owner: Matthias

## Summary

Turn the forwarding alpha foundation into the next production-shaped slice.

The previous sprint proved signed `_trellisForwarding` envelopes can replace raw
identity-shaped args for server trusted calls while keeping Convex handlers
authoritative. This sprint should harden the parts that make the envelope safe
for destructive operation execution: expected function-ref verification,
one-time replay redemption, confirmation binding, and MCP operation execute
coverage.

This is still not API freeze. Raw forwarding stays in place until the migration
slice.

## Goals

- Make expected function-ref verification the default wherever Trellis knows the
  Convex function identity at the transport edge.
- Add a first-party production-shaped replay/confirmation store path for
  operation execute.
- Prove `operation-execute` envelopes use one-time redemption.
- Prove MCP destructive operation execute re-runs backend authority after
  confirmation.
- Keep all new helpers focused and internal until public naming/API decisions
  are made.

## Non-Goals

- Do not delete raw `_trustedForwardingKey` / `_trustedForwarding`.
- Do not delete `tool.fromOperation(...)`.
- Do not freeze `@lupinum/trellis/backend` versus
  `@lupinum/trellis/functions`.
- Do not finalize bridge extraction.
- Do not expose broad public forwarding helper APIs.
- Do not replace the external security review requirement.

## Key Changes

### 1. Function-Ref Verification Wiring

Current state:

- envelope verification supports `expectedFunctionRef`;
- server-created envelopes include `functionRef`;
- protected handler setup now accepts internal `trustedForwardingFunctionRef`
  metadata from the Convex function definition and verifies signed envelopes
  against it when present.

Remaining work:

- keep old raw forwarding behavior unchanged;
- wire this metadata from generated operation refs or starter output instead of
  hand-authored definitions.

Acceptance evidence:

- wrong function-ref envelopes fail closed through the real protected handler
  path, not only through low-level helper tests.

### 2. Operation Execute Replay Redemption

Current state:

- envelope verification supports a `redeemJti` hook;
- replay is required by the RFC only for `operation-execute` in alpha;
- backend destructive operation execution already uses the destructive safety
  redemption table as the one-time confirmation redemption path;
- a regression test now proves preview success is not an authorization grant:
  execute re-runs authorization before redeeming or running the handler.

Remaining work:

- wire envelope replay redemption to the existing destructive safety table at
  Convex verification time. The transport side now signs `operation-execute`
  envelopes with the confirmation token `jti` so the IDs already match.

Acceptance evidence:

- first execute with a valid confirmation/envelope succeeds;
- replaying the same execute fails;
- revoked permission between preview and execute fails before redemption.

### 3. Confirmation Binding Recheck

Current state:

- destructive operation safety already has confirmation/redemption concepts;
- forwarding execute envelopes are not yet fully bound into that path.

Sprint work:

- ensure destructive execute binds:
  - operation id;
  - preview ref;
  - execute ref;
  - tenant key;
  - args hash;
  - preview confirmation hash;
  - expiry;
  - replay id / `jti`;
- make execute re-run guard/load/authorize/tenant checks after confirmation
  redemption;
- add one explicit test proving preview success is not an authorization grant.

Acceptance:

- changed args after preview fail;
- changed tenant binding fails;
- revoked permission between preview and execute fails;
- valid confirmation still executes once.

### 4. MCP Operation Execute Fixture

Current state:

- `phase0-workspace-mcp` proves descriptor imports, generated refs, and direct
  bounded-write mutation safety;
- forwarding envelopes are proven mainly through unit/server helper tests.

Current progress:

- unit coverage now proves MCP destructive operation preview and execute route
  through the trusted server caller without passing raw `principal` /
  `delegation` as app args;
- the real server helper then seals those trusted calls into `_trellisForwarding`
  envelopes.
- MCP destructive execute now passes a per-call trusted-forwarding envelope
  override with `purpose: operation-execute` and the verified confirmation token
  `jti`.

Remaining work:

- extend the `phase0-workspace-mcp` fixture so destructive operation execute
  runs through the same path;
- keep MCP tool files importing shared descriptors plus generated refs only;

Acceptance evidence:

- MCP destructive preview works;
- MCP destructive execute is signed as `operation-execute` and shares the
  confirmation token `jti`;
- raw identity fields are absent from public app args;
- backend denial remains authoritative.

### 5. RFC And Security Review Prep

Current state:

- RFC is an alpha decision baseline;
- owner is named;
- external reviewer is still TBD.

Sprint work:

- add test vectors for the final alpha canonicalization cases used by this
  sprint;
- document the replay/confirmation store contract;
- record what remains open for external review;
- name the external reviewer or record the blocker if not yet assigned.

Acceptance:

- RFC explains exactly what this sprint made real;
- remaining security review questions are explicit and finite.

## Test Plan

Focused unit tests:

```bash
pnpm exec vitest run --project=unit \
  tests/unit/trusted-forwarding.test.ts \
  tests/unit/trusted-forwarding-envelope.test.ts \
  tests/unit/server-convex-utils.test.ts \
  tests/unit/define-convex-tool.test.ts \
  tests/unit/mcp-operation-binding.test.ts
```

Destructive safety and fixture tests:

```bash
pnpm exec vitest run --project=unit \
  tests/unit/operation-descriptor.test.ts \
  tests/unit/phase0-workspace-mcp-fixture.test.ts \
  tests/unit/operation-ref-codegen.test.ts
```

Regression checks:

```bash
pnpm exec vitest run --project=unit
pnpm run check:docs:api-surface
pnpm run check:publish-surface
node scripts/bench-forwarding-envelope.mjs
git diff --check
```

Fixture validation, if touched:

```bash
pnpm --dir tests/fixtures/phase0-workspace-mcp exec convex codegen --typecheck=disable
pnpm --dir tests/fixtures/phase0-workspace-mcp exec nuxi build
```

## Risks

- Function-ref identity may not be available at every protected handler setup
  point without changing builder internals.
- Reusing destructive safety redemption state may expose table/index assumptions
  that need clearer diagnostics.
- MCP operation execute may reveal that confirmation and forwarding currently
  duplicate replay concepts.

If a risk appears, prefer one canonical store/path over adding a second
compatibility layer.

## Done When

- Real protected handler paths reject wrong-function envelopes.
- Destructive operation execute has one-time replay redemption.
- Execute re-runs backend authorization after confirmation.
- MCP destructive operation execute uses signed forwarding in tests.
- Raw forwarding remains supported but is no longer used by server/MCP alpha
  callers.
- RFC and Phase 0 notes describe the remaining external security-review work.
