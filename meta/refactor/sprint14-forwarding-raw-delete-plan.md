# Sprint 14: Forwarding Raw Delete

## Summary

Delete the remaining raw trusted-forwarding transport from Trellis default
runtime paths. Sprint 12 made raw forwarding fail in production. Sprint 13 moved
first-party callers to signed `_trellisForwarding` envelopes. This sprint
finishes the hard cut: validators, parser branches, broad fallback tests, and
docs should no longer preserve `_trustedForwardingKey` / `_trustedForwarding` as
an active path.

Owner: Matthias.

## Current State

- Server, MCP, bridge, examples, and testing helpers now emit signed
  `_trellisForwarding`.
- Raw forwarding remains in `trustedForwardingValidators`, parser fallback code,
  a focused fallback-observability test, canonical hashing vectors, and negative
  assertions.
- Ginko source and templates no longer emit raw fields, but generated
  `_generated/component.ts` still contains raw fields until downstream
  regeneration after Trellis validators are cleaned.
- Operation execute uses `purpose: "operation-execute"` and shares confirmation
  `jti`.
- Operation preview purpose forwarding is still not proven.

## Non-Goals

- Do not change the signing algorithm.
- Do not redesign bridge/component APIs.
- Do not keep raw forwarding as a dev/test compatibility path.
- Do not edit generated Ginko files manually.
- Do not start Slice 5 operation descriptors yet.

## Work Items

### 1. Delete Raw Runtime Transport

- [ ] Remove `_trustedForwardingKey` and `_trustedForwarding` from
      `TrustedForwardingInput`.
- [ ] Remove raw fields from `trustedForwardingValidators`.
- [ ] Delete raw fallback parsing, key comparison, and fallback counters from
      `src/runtime/trusted-forwarding/shared.ts`.
- [ ] Delete production mixed signed/raw special handling; raw fields should now
      be normal unexpected args at validators or ignored only by canonical
      metadata stripping where needed for hash compatibility tests.
- [ ] Keep `hasForwardedIdentityFields(...)` focused on identity-shaped public
      args and signed forwarding metadata, not raw transport.

### 2. Delete Raw Tests And Replace With Signed Invariants

- [ ] Delete raw fallback happy-path tests from
      `tests/unit/trusted-forwarding.test.ts`.
- [ ] Keep only negative tests that prove raw fields are not accepted by default
      validators.
- [ ] Update auth actor, trusted-forwarding, and server tests so signed
      forwarding covers all previously raw actor/delegation scenarios.
- [ ] Remove any test-only raw fallback counter assertions.
- [ ] Keep canonical hashing vectors for nested business keys named
      `_trustedForwardingKey` / `_trustedForwarding`, because nested business
      args with those names remain authenticated.

### 3. Operation Preview Purpose

- [ ] Find the MCP operation preview call path.
- [ ] Ensure forwarded operation preview calls, when trusted forwarding is used,
      sign with `purpose: "operation-preview"`.
- [ ] Ensure operation execute remains `purpose: "operation-execute"` and still
      shares confirmation `jti`.
- [ ] Add unit coverage proving preview rejects an envelope with execute
      purpose and execute rejects a preview-purpose envelope.
- [ ] Update `meta/trellis-1.0-refactor-plan.md` for the preview-purpose proof.

### 4. Docs And Inventory Cleanup

- [ ] Remove active-doc references that teach `_trustedForwardingKey` or
      `_trustedForwarding`.
- [ ] Keep historical meta references only where explicitly labeled
      historical/planning reference.
- [ ] Update `meta/refactor/sprint1-public-surface-inventory.md` if raw docs
      move or are deleted.
- [ ] Update `meta/trellis-1.0-refactor-plan.md` Slice 4 delete/done checkboxes.
- [ ] Record that Ginko generated component types need regeneration after this
      sprint, if still true.

### 5. Ginko Compatibility Check

- [ ] Run Ginko source typechecks after Trellis raw validators are deleted.
- [ ] Confirm Ginko source/templates/tests contain no raw forwarding references.
- [ ] Record generated-file-only raw references as a regeneration task, not a
      Trellis compatibility reason.
- [ ] Do not add a shim for generated raw fields.

## Verification

Run before committing:

```bash
pnpm exec vitest run --project=unit \
  tests/unit/trusted-forwarding-envelope.test.ts \
  tests/unit/trusted-forwarding.test.ts \
  tests/unit/server-convex-utils.test.ts \
  tests/unit/create-component-bridge.test.ts \
  tests/unit/define-convex-tool.test.ts \
  tests/unit/functions-defineTrellis.test.ts \
  tests/unit/destructive-confirmation.test.ts \
  tests/unit/auth-actor.test.ts

pnpm --dir examples/07-mcp-reference test
pnpm run test:types:bridge
pnpm run check:publish-surface
pnpm run check:docs:api-surface
pnpm run check:refactor:surface:inventory
pnpm run check:cli
node scripts/bench-forwarding-envelope.mjs
```

Ginko verification:

```bash
pnpm --filter @lupinum/ginko-cms-convex typecheck
pnpm --filter @lupinum/ginko-cms typecheck
```

If broader Ginko suites still fail on unrelated unclassified handlers or
generated export drift, record that as an existing blocker and do not add Trellis
fallback code.

## Acceptance Criteria

- [ ] Trellis default validators accept `_trellisForwarding` only.
- [ ] No runtime parser branch accepts `_trustedForwardingKey` /
      `_trustedForwarding`.
- [ ] No Trellis first-party caller or helper emits raw forwarding fields.
- [ ] Raw forwarding references remain only in historical docs, canonical
      nested-key hash vectors, or negative tests.
- [ ] Operation preview forwarding purpose is covered.
- [ ] Slice 4 "Done Means" has only external security review/RFC acceptance left,
      or those remaining blockers are explicitly called out.
- [ ] Ginko source still typechecks against the signed-only Trellis source.
- [ ] Work is committed as one sprint commit after verification.

## Exit Notes To Capture

- [ ] Whether `trustedForwardingValidators` is now signed-only.
- [ ] Exact remaining raw references, if any, with justification.
- [ ] Whether Ginko generated component files must be regenerated.
- [ ] Whether Slice 4 can close after external forwarding security review.

