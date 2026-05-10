# Sprint: Forwarding Hardening And Operation Execute

Status: local implementation complete; external security review pending
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
- generated operation refs now derive a Convex `functionRef` string from the
  same `apiPath` that binds the ref, and projected operation metadata can carry
  that function ref into protected handler setup.
- the existing MCP resource generator now emits execute/preview operation refs
  with explicit function-ref metadata for generated destructive tools.

Remaining work:

- keep old raw forwarding behavior unchanged.

Template audit:

- no additional starter template currently creates destructive operation
  projections; the CLI resource generator and `phase0-workspace-mcp` fixture now
  both include projected function-ref metadata.

Acceptance evidence:

- wrong function-ref envelopes fail closed through the real protected handler
  path, not only through low-level helper tests.

### 2. Operation Execute Replay Redemption

Current state:

- envelope verification supports a `redeemJti` hook;
- replay is required by the RFC only for `operation-execute` in alpha;
- backend destructive operation execution already uses the destructive safety
  redemption table as the one-time confirmation redemption path;
- protected handler setup now rejects `operation-execute` envelopes whose `jti`
  is already present in the destructive safety redemption table before handler
  execution;
- destructive execution rejects `operation-execute` envelopes whose `jti` does
  not match the destructive confirmation token `jti`;
- missing or malformed destructive safety stores fail with one actionable
  misconfiguration message that names the redemption table, `by_jti` index, and
  audit table before any destructive handler runs;
- doctor now validates the first-party destructive safety store contract
  statically, including redemption fields, audit fields, and `by_jti`;
- a regression test now proves preview success is not an authorization grant:
  execute re-runs authorization before redeeming or running the handler.

Remaining work:

- keep the first-party MCP rate-limit store path covered. The Redis store,
  production fail-closed checks, doctor checks, and parallel-consume unit tests
  already provide the alpha path; avoid adding a second store abstraction in
  this sprint.

Acceptance evidence:

- first execute with a valid confirmation/envelope succeeds through the
  destructive handler path;
- replaying the same execute fails through the existing redemption table;
- revoked permission between preview and execute fails before redemption.

### 3. Confirmation Binding Recheck

Current state:

- destructive operation safety already has confirmation/redemption concepts;
- forwarding execute envelopes now share the destructive confirmation token
  `jti` and are rejected when that replay identity does not match.

Completed work:

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
- the `phase0-workspace-mcp` fixture now exercises destructive preview and
  confirmed execute through its generated descriptor/ref tool, and records the
  `operation-execute` forwarding override on the execute call.

Remaining work:

- keep MCP tool files importing shared descriptors plus generated refs only;

Acceptance evidence:

- MCP destructive preview works;
- MCP destructive execute is signed as `operation-execute` and shares the
  confirmation token `jti`;
- raw identity fields are absent from public app args;
- backend denial remains authoritative.

Rate-limit store status:

- `createRedisMcpRateLimitStore(...)` is the first-party production path for MCP
  ingress rate limiting in alpha;
- production rate-limited tools fail closed without an explicit store;
- doctor recognizes direct and locally factored Redis store setup;
- unit coverage proves the Redis store does not allow more than the configured
  limit under parallel consume calls.

### 5. RFC And Security Review Prep

Current state:

- RFC is an alpha decision baseline;
- owner is named;
- external reviewer is still TBD;
- the RFC now includes a finite external-review question list covering algorithm,
  TTLs, replay policy, canonical hashing, shared confirmation/forwarding `jti`,
  issuer/audience/function-ref binding, validators, raw fallback, redaction, and
  maximum envelope size;
- envelope verification now rejects serialized envelopes larger than the alpha
  8192-byte limit before payload verification.
- reviewer-blocking issues are partly addressed in the alpha spike:
  top-level-only forwarding metadata exclusion, unsupported value rejection,
  expected purpose/transport checks, and max-TTL enforcement now have tests.
  Raw fallback observability/production disablement remains migration-slice
  work because raw forwarding is intentionally retained in this sprint.

Remaining work:

- name the external reviewer. This is the only remaining RFC review gate for
  the alpha spike; production forwarding implementation and public API freeze
  still wait for that review.

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
