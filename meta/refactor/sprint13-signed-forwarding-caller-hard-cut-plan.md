# Sprint 13: Signed Forwarding Caller Hard Cut

## Summary

Move every first-party Trellis forwarding caller to signed `_trellisForwarding`
envelopes and stop teaching raw `_trustedForwardingKey` /
`_trustedForwarding` fields outside historical docs and explicitly retained
dev/test fallback coverage.

Sprint 12 made the verifier production-hard: signed envelopes are verified
first, production rejects raw and mixed signed/raw fields, canonical hashing is
exact, and replay/TTL/failure classes are covered. This sprint applies that
contract to the real callers so Slice 4 can move from "production rejects raw"
to "Trellis no longer emits raw forwarding."

Owner: Matthias.

## Current State

- Server Convex callers already sign `_trellisForwarding` through
  `createTrustedForwardingEnvelopeArgs(...)`.
- MCP operation execution already passes signed forwarding metadata through the
  server caller path.
- `packages/trellis-bridge/src/create-component-bridge.ts` still constructs raw
  `_trustedForwardingKey` / `_trustedForwarding` args.
- `tests/unit/create-component-bridge.test.ts`, `examples/07-mcp-reference`,
  `src/runtime/testing`, and Ginko CMS still contain raw forwarding fixtures.
- Raw forwarding validators still exist so legacy generated validators and
  dev/test fallback paths can be identified, but production extraction rejects
  them.

## Non-Goals

- Do not redesign the bridge API.
- Do not finish full bridge extraction.
- Do not delete the dev/test fallback parser in `trusted-forwarding/shared.ts`
  until all first-party and Ginko proof points are signed.
- Do not stabilize new public forwarding helper exports.
- Do not change the forwarding signing algorithm or RFC security decisions in
  this sprint.

## Work Items

### 1. Bridge Caller Signing

- [ ] Replace raw bridge forwarding arg construction in
      `packages/trellis-bridge/src/create-component-bridge.ts` with the same
      signed envelope helper boundary used by server callers.
- [ ] Ensure bridge calls sign the app args only, excluding forwarding metadata
      through the canonicalizer.
- [ ] Ensure bridge calls include exact `functionRef` where the component
      bridge knows the target function.
- [ ] Ensure bridge query/mutation/action purposes map to the correct
      forwarding purpose.
- [ ] Ensure bridge does not put forwarded `principal` or `delegation` into
      public app args outside the envelope.
- [ ] Keep the signing helper internal to the package/runtime path; do not add a
      broad public export.

### 2. Bridge Verification Context

- [ ] Update bridge-side `setTrustedForwardingContext(...)` calls to pass
      expected issuer, audience, transport, purpose, and function ref when
      available.
- [ ] Fail closed when a bridge-protected function cannot supply exact
      forwarding function-ref metadata.
- [ ] Add tests for wrong function ref and wrong purpose on bridge calls.
- [ ] Add tests proving mixed signed/raw bridge args fail in production.

### 3. Testing Helper Hard Cut

- [ ] Replace raw forwarding emitted by `src/runtime/testing` helpers with
      signed envelopes.
- [ ] Keep one focused unit test for dev/test raw fallback observability in
      `tests/unit/trusted-forwarding.test.ts`; remove broad raw helper usage
      elsewhere.
- [ ] Update any fixture helper that currently returns `_trustedForwardingKey`
      / `_trustedForwarding` to return `_trellisForwarding`.
- [ ] Add a regression test proving test helpers do not emit raw forwarding
      fields.

### 4. MCP Reference Example Cleanup

- [ ] Replace raw forwarding in `examples/07-mcp-reference/test` with signed
      `_trellisForwarding` envelopes.
- [ ] Ensure operation preview forwarding uses
      `purpose: "operation-preview"`.
- [ ] Ensure operation execute forwarding uses
      `purpose: "operation-execute"` and shares the confirmation `jti`.
- [ ] Add/keep assertions that backend handlers remain authoritative after a
      valid envelope: principal, actor, guard, load, authorize, tenant, and
      handler still run.

### 5. Ginko CMS Cross-Repo Proof

- [ ] Update the Ginko CMS bridge/test helper raw forwarding call sites to use
      signed envelopes against the packed/local Trellis package.
- [ ] Keep generated Ginko Convex files out of manual edits unless regeneration
      is the accepted project workflow.
- [ ] Run the smallest Ginko validation suite that proves component bridge
      forwarding still resolves principal/actor correctly.
- [ ] Record any Ginko blocker in this sprint plan instead of adding a Trellis
      compatibility path.

### 6. Docs And Inventory

- [ ] Update `meta/trellis-1.0-refactor-plan.md` Slice 4 checkboxes for server,
      MCP, bridge, and testing helper signed forwarding.
- [ ] Update historical allowlist notes if any raw forwarding references move
      from active docs/examples into historical-only docs.
- [ ] Do not update public docs to teach raw forwarding.
- [ ] If raw fallback remains after this sprint, document the exact remaining
      file and deletion trigger.

## Verification

Run these before committing:

```bash
pnpm exec vitest run --project=unit \
  tests/unit/trusted-forwarding-envelope.test.ts \
  tests/unit/trusted-forwarding.test.ts \
  tests/unit/server-convex-utils.test.ts \
  tests/unit/create-component-bridge.test.ts \
  tests/unit/define-convex-tool.test.ts \
  tests/unit/functions-defineTrellis.test.ts \
  tests/unit/destructive-confirmation.test.ts

pnpm --dir examples/07-mcp-reference test
pnpm run test:types:bridge
pnpm run check:publish-surface
pnpm run check:docs:api-surface
pnpm run check:refactor:surface:inventory
pnpm run check:cli
node scripts/bench-forwarding-envelope.mjs
```

For Ginko CMS, run the smallest available local suite that covers component
bridge forwarding. Record the exact command and result in this plan before
commit.

## Acceptance Criteria

- [ ] Trellis bridge emits signed `_trellisForwarding` envelopes and no raw
      forwarding fields.
- [ ] Trellis server/MCP/example/test helper callers emit signed forwarding and
      no raw forwarding fields except the one focused raw fallback test.
- [ ] Bridge verification passes expected purpose, transport, audience, issuer,
      and exact function ref where available.
- [ ] Operation preview and execute use distinct forwarding purposes.
- [ ] Operation execute shares confirmation `jti`.
- [ ] Ginko CMS bridge proof either passes on signed forwarding or has a
      documented blocker with no Trellis compatibility shim added.
- [ ] Public/docs/publish surfaces remain unchanged except for accepted
      forwarding docs/inventory updates.
- [ ] Work is committed as one sprint commit after verification.

## Exit Notes To Capture

- [ ] Exact raw forwarding references that remain, if any, and why they are
      historical/dev-test-only.
- [ ] Whether `trustedForwardingValidators` can drop raw fields in Sprint 14.
- [ ] Whether Ginko needs a generated-code refresh to remove raw fields from
      `_generated/component.ts`.
- [ ] Whether bridge function-ref metadata is complete enough to fail closed
      everywhere, or which caller lacks exact metadata.
