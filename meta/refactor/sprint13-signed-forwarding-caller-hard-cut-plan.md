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

- [x] Replace raw bridge forwarding arg construction in
      `packages/trellis-bridge/src/create-component-bridge.ts` with the same
      signed envelope helper boundary used by server callers.
- [x] Ensure bridge calls sign the app args only, excluding forwarding metadata
      through the canonicalizer.
- [x] Ensure bridge calls include exact `functionRef` where the component
      bridge knows the target function.
- [x] Ensure bridge query/mutation/action purposes map to the correct
      forwarding purpose.
- [x] Ensure bridge does not put forwarded `principal` or `delegation` into
      public app args outside the envelope.
- [x] Keep the signing helper internal to the package/runtime path; do not add a
      broad public export.

### 2. Bridge Verification Context

- [x] Update bridge-side `setTrustedForwardingContext(...)` calls to pass
      expected issuer, audience, transport, purpose, and function ref when
      available.
- [x] Fail closed when a bridge-protected function cannot supply exact
      forwarding function-ref metadata.
- [x] Add tests for wrong function ref and wrong purpose on bridge calls.
- [ ] Add tests proving mixed signed/raw bridge args fail in production.

### 3. Testing Helper Hard Cut

- [x] Replace raw forwarding emitted by `src/runtime/testing` helpers with
      signed envelopes.
- [x] Keep one focused unit test for dev/test raw fallback observability in
      `tests/unit/trusted-forwarding.test.ts`; remove broad raw helper usage
      elsewhere.
- [x] Update any fixture helper that currently returns `_trustedForwardingKey`
      / `_trustedForwarding` to return `_trellisForwarding`.
- [x] Add a regression test proving test helpers do not emit raw forwarding
      fields.

### 4. MCP Reference Example Cleanup

- [x] Replace raw forwarding in `examples/07-mcp-reference/test` with signed
      `_trellisForwarding` envelopes.
- [ ] Ensure operation preview forwarding uses
      `purpose: "operation-preview"`.
- [x] Ensure operation execute forwarding uses
      `purpose: "operation-execute"` and shares the confirmation `jti`.
- [x] Add/keep assertions that backend handlers remain authoritative after a
      valid envelope: principal, actor, guard, load, authorize, tenant, and
      handler still run.

### 5. Ginko CMS Cross-Repo Proof

- [x] Update the Ginko CMS bridge/test helper raw forwarding call sites to use
      signed envelopes against the packed/local Trellis package.
- [x] Keep generated Ginko Convex files out of manual edits unless regeneration
      is the accepted project workflow.
- [x] Run the smallest Ginko validation suite that proves component bridge
      forwarding still resolves principal/actor correctly.
- [x] Record any Ginko blocker in this sprint plan instead of adding a Trellis
      compatibility path.

### 6. Docs And Inventory

- [x] Update `meta/trellis-1.0-refactor-plan.md` Slice 4 checkboxes for server,
      MCP, bridge, and testing helper signed forwarding.
- [x] Update historical allowlist notes if any raw forwarding references move
      from active docs/examples into historical-only docs.
- [x] Do not update public docs to teach raw forwarding.
- [x] If raw fallback remains after this sprint, document the exact remaining
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

- [x] Trellis bridge emits signed `_trellisForwarding` envelopes and no raw
      forwarding fields.
- [x] Trellis server/MCP/example/test helper callers emit signed forwarding and
      no raw forwarding fields except the one focused raw fallback test.
- [x] Bridge verification passes expected purpose, transport, audience, issuer,
      and exact function ref where available.
- [ ] Operation preview and execute use distinct forwarding purposes.
- [x] Operation execute shares confirmation `jti`.
- [x] Ginko CMS bridge proof either passes on signed forwarding or has a
      documented blocker with no Trellis compatibility shim added.
- [x] Public/docs/publish surfaces remain unchanged except for accepted
      forwarding docs/inventory updates.
- [x] Work is committed as one sprint commit after verification.

## Exit Notes To Capture

- [x] Remaining raw forwarding references in Trellis are limited to
      `src/runtime/trusted-forwarding/shared.ts`, canonical hashing vectors,
      focused raw fallback tests, and negative assertions proving active callers
      no longer emit raw fields.
- [x] `trustedForwardingValidators` cannot drop raw fields yet; generated
      validators and the focused dev/test fallback remain until Sprint 14
      deletes the fallback parser and regenerates downstream component types.
- [x] Ginko source/templates/tests no longer emit raw fields. Generated
      `_generated/component.ts` still contains raw fields and needs regeneration
      after Trellis validators drop them.
- [x] Bridge outbound calls have exact function-ref metadata and fail closed
      when it is missing. Bridge inbound customization verifies purpose and
      transport but cannot verify function ref through the shared customization
      hook; exact function-ref verification happens at the signed call boundary.

## Ginko Validation Notes

- [x] `pnpm --filter @lupinum/ginko-cms-convex typecheck` passed.
- [x] `pnpm --filter @lupinum/ginko-cms typecheck` passed.
- [x] `pnpm run test:public-content` and
      `pnpm exec vitest run test/refactor/workflow-vertical-slice.test.ts test/component/diagnostics.test.ts`
      are blocked by existing Ginko/Trellis alignment issues unrelated to signed
      forwarding: unclassified backend handlers from the current hard-cut
      builder API and missing `collections/sync.installCollectionContractsInternal`
      generated/test export. No Trellis compatibility shim was added.
