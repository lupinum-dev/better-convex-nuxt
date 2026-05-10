# Sprint 12: Forwarding Production Hardening

## Goal

Turn signed trusted-forwarding from an alpha-compatible path into the production
contract Trellis 1.0 can stand behind.

Sprint 11 proved the bridge package boundary against Ginko. The next blocker is
not more bridge movement; it is making the forwarding verifier strict enough
that server, MCP, and bridge callers can migrate without carrying the old raw
trusted-forwarding path beside it.

This sprint resolves the external review blockers in
`meta/rfc-forwarding-envelope.md`, hardens canonical args hashing, enforces
purpose/TTL/function/audience rules in the verifier, and starts deleting raw
fallback behavior from production/default paths.

## Non-Goals

- Do not migrate every MCP or bridge caller yet.
- Do not complete Ginko raw forwarding migration yet.
- Do not introduce asymmetric signing unless the RFC decision changes.
- Do not add a compatibility mode for production raw forwarding.
- Do not build a generic key-management framework.
- Do not change backend authorization semantics. A valid envelope authenticates
  only the forwarding boundary; guard/load/authorize/handler remain
  authoritative.

## Current Findings

External review allowed alpha to continue but blocked production acceptance on:

- canonical args hashing was not exact enough;
- verifier did not explicitly reject envelopes whose
  `expiresAt - issuedAt` exceeds the max TTL for the purpose;
- operation-execute replay wording required atomic redemption before or with
  irreversible side effects;
- raw fallback was still too permissive for production/default behavior.

Trellis already has useful alpha pieces:

- compact JWS-like HS256 envelope;
- top-level-only forwarding metadata exclusion;
- unsupported canonical args values fail closed;
- function-ref, purpose, transport, max-size, expiry, and benchmark coverage;
- operation-execute `jti` alignment with confirmation token;
- destructive execute `jti` mismatch rejection.

The sprint should preserve those pieces and tighten the production contract.

## Work Items

### 1. Finalize RFC Blocking Decisions

- [ ] Update canonical args hashing to specify exact supported value classes.
- [ ] Specify top-level-only metadata exclusion for `_trellisForwarding`,
      `_trustedForwardingKey`, `_trustedForwarding`, and `__trellis`; nested
      business args with those names remain authenticated.
- [ ] Specify deterministic key ordering for every object level.
- [ ] Specify string encoding as UTF-8 before hashing.
- [ ] Specify number handling, including rejection of non-finite numbers and
      deterministic handling of `-0`.
- [ ] Specify bigint/int64 policy.
- [ ] Specify bytes policy.
- [ ] Specify unsupported Convex values and their failure mode.
- [ ] Add canonicalization test vectors to the RFC.
- [ ] Add verifier rule: reject `expiresAt - issuedAt` greater than the max TTL
      for the envelope purpose.
- [ ] Add replay rule: operation-execute `jti` redemption must be atomic before
      irreversible side effects or in the same backend transaction as execution.
- [ ] Add production/default rule: raw fallback is disabled; mixed signed/raw
      forwarding fields are rejected.

### 2. Harden Canonical Args Hashing

- [ ] Replace any loose JSON-stringify hashing path with the RFC canonicalizer.
- [ ] Exclude only top-level forwarding metadata keys before hashing.
- [ ] Add unit tests proving nested keys named `principal`, `delegation`,
      `_trellisForwarding`, `_trustedForwardingKey`, `_trustedForwarding`, and
      `__trellis` are still authenticated when nested inside business args.
- [ ] Add unit tests for deterministic object key ordering.
- [ ] Add unit tests for string encoding.
- [ ] Add unit tests for non-finite numbers.
- [ ] Add unit tests for `-0`.
- [ ] Add unit tests for bigint/int64 and bytes according to the RFC decision.
- [ ] Add unit tests for unsupported Convex values.

### 3. Enforce Verifier Context

- [ ] Require expected audience.
- [ ] Require expected issuer.
- [ ] Require exact function ref for every forwarding-protected handler.
- [ ] Require expected purpose.
- [ ] Require expected transport.
- [ ] Reject unknown `kid`.
- [ ] Reject wrong `alg`.
- [ ] Reject invalid signature.
- [ ] Reject expired envelopes.
- [ ] Reject envelopes with excessive TTL even when not expired.
- [ ] Reject oversized envelopes.
- [ ] Ensure errors are code-only and do not expose raw envelope, principal,
      delegation, bearer tokens, `sub`, `jti`, principal keys, tenant keys, or
      confirmation payloads.

### 4. Production Raw Fallback Hard Cut

- [ ] Identify the current raw `_trustedForwardingKey` and `_trustedForwarding`
      validation/parsing paths.
- [ ] Keep raw fallback only if explicitly scoped to development/test migration
      fixtures.
- [ ] Delete raw fallback from production/default context setup.
- [ ] Reject mixed signed/raw forwarding fields in production/default mode.
- [ ] Add a redacted observation or finding for any temporary dev/test raw
      fallback path that remains.
- [ ] Update tests so raw fields fail in production/default mode.
- [ ] Update docs/comments so raw fallback is not taught as a 1.0 path.

### 5. Atomic Replay Contract

- [ ] Locate the current operation-execute confirmation/replay boundary.
- [ ] Make operation-execute replay redemption one-source-of-truth at the
      backend/destructive execution boundary.
- [ ] Ensure execute re-runs guard, load, authorize, tenant binding, and drift
      checks after confirmation redemption.
- [ ] Add tests proving two same-`jti` operation-execute attempts cannot both
      pass.
- [ ] Add tests proving preview success is not an authorization grant.

### 6. Server/MCP Signing Helper Readiness

- [ ] Verify the server/MCP signing helper uses the same canonicalizer as the
      verifier.
- [ ] Verify helper signs app args without `_trellisForwarding`,
      `_trustedForwardingKey`, `_trustedForwarding`, or `__trellis`.
- [ ] Verify helper does not place principal or delegation in public app args.
- [ ] Keep helper out of broad public barrels until the production verifier
      contract is accepted.

## Verification

Suggested focused commands:

```bash
pnpm exec vitest run --project=unit \
  tests/unit/trusted-forwarding-envelope.test.ts \
  tests/unit/trusted-forwarding-context.test.ts \
  tests/unit/trusted-forwarding-canonical-args.test.ts

pnpm run test:types:bridge
pnpm run check:publish-surface
pnpm run check:docs:api-surface
pnpm run check:refactor:surface:inventory
pnpm run check:cli
node scripts/bench-forwarding-envelope.mjs
```

If exact test file names differ, update this sprint plan when implementing
rather than adding duplicate test files.

## Acceptance Criteria

- [ ] RFC review blockers are resolved in `meta/rfc-forwarding-envelope.md`.
- [ ] Canonical args hashing has precise tests and top-level-only metadata
      exclusion.
- [ ] Verifier rejects wrong audience, issuer, function ref, purpose, transport,
      unknown `kid`, wrong `alg`, invalid signature, expired token, excessive
      TTL, oversized envelope, args drift, and replay.
- [ ] Production/default mode rejects raw forwarding fields.
- [ ] Production/default mode rejects mixed signed/raw forwarding fields.
- [ ] Operation-execute replay redemption is atomic at the backend execution
      boundary.
- [ ] Verification errors remain redacted.
- [ ] Forwarding benchmark still runs and records a baseline without becoming a
      flaky hard gate.
- [ ] No new compatibility shim is added.

## Exit Notes To Capture

- [ ] Whether HS256 remains accepted for 1.0 production or gets replaced by an
      asymmetric design before final.
- [ ] Whether any dev/test-only raw fallback remains, and exactly where.
- [ ] Whether current confirmation/replay storage is sufficient for production
      operation-execute redemption or needs the first-party store sprint next.
- [ ] Whether next sprint should migrate server/MCP/bridge callers to signed-only
      forwarding or build the first-party production confirmation/rate-limit
      stores first.
