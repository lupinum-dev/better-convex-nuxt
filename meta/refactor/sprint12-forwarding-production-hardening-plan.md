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

- [x] Update canonical args hashing to specify exact supported value classes.
- [x] Specify top-level-only metadata exclusion for `_trellisForwarding`,
      `_trustedForwardingKey`, `_trustedForwarding`, and `__trellis`; nested
      business args with those names remain authenticated.
- [x] Specify deterministic key ordering for every object level.
- [x] Specify string encoding as UTF-8 before hashing.
- [x] Specify number handling, including rejection of non-finite numbers and
      deterministic handling of `-0`.
- [x] Specify bigint/int64 policy.
- [x] Specify bytes policy.
- [x] Specify unsupported Convex values and their failure mode.
- [x] Add canonicalization test vectors to the RFC.
- [x] Add verifier rule: reject `expiresAt - issuedAt` greater than the max TTL
      for the envelope purpose.
- [x] Add replay rule: operation-execute `jti` redemption must be atomic before
      irreversible side effects or in the same backend transaction as execution.
- [x] Add production/default rule: raw fallback is disabled; mixed signed/raw
      forwarding fields are rejected.

### 2. Harden Canonical Args Hashing

- [x] Replace any loose JSON-stringify hashing path with the RFC canonicalizer.
- [x] Exclude only top-level forwarding metadata keys before hashing.
- [x] Add unit tests proving nested keys named `principal`, `delegation`,
      `_trellisForwarding`, `_trustedForwardingKey`, `_trustedForwarding`, and
      `__trellis` are still authenticated when nested inside business args.
- [x] Add unit tests for deterministic object key ordering.
- [x] Add unit tests for string encoding.
- [x] Add unit tests for non-finite numbers.
- [x] Add unit tests for `-0`.
- [x] Add unit tests for bigint/int64 and bytes according to the RFC decision.
- [x] Add unit tests for unsupported Convex values.

### 3. Enforce Verifier Context

- [x] Require expected audience.
- [x] Require expected issuer.
- [x] Require exact function ref for every forwarding-protected handler.
- [x] Require expected purpose.
- [x] Require expected transport.
- [x] Reject unknown `kid`.
- [x] Reject wrong `alg`.
- [x] Reject invalid signature.
- [x] Reject expired envelopes.
- [x] Reject envelopes with excessive TTL even when not expired.
- [x] Reject oversized envelopes.
- [x] Ensure errors are code-only and do not expose raw envelope, principal,
      delegation, bearer tokens, `sub`, `jti`, principal keys, tenant keys, or
      confirmation payloads.

### 4. Production Raw Fallback Hard Cut

- [x] Identify the current raw `_trustedForwardingKey` and `_trustedForwarding`
      validation/parsing paths.
- [x] Keep raw fallback only if explicitly scoped to development/test migration
      fixtures.
- [x] Delete raw fallback from production/default context setup.
- [x] Reject mixed signed/raw forwarding fields in production/default mode.
- [x] Add a redacted observation or finding for any temporary dev/test raw
      fallback path that remains.
- [x] Update tests so raw fields fail in production/default mode.
- [x] Update docs/comments so raw fallback is not taught as a 1.0 path.

### 5. Atomic Replay Contract

- [x] Locate the current operation-execute confirmation/replay boundary.
- [x] Make operation-execute replay redemption one-source-of-truth at the
      backend/destructive execution boundary.
- [x] Ensure execute re-runs guard, load, authorize, tenant binding, and drift
      checks after confirmation redemption.
- [x] Add tests proving two same-`jti` operation-execute attempts cannot both
      pass.
- [x] Add tests proving preview success is not an authorization grant.

### 6. Server/MCP Signing Helper Readiness

- [x] Verify the server/MCP signing helper uses the same canonicalizer as the
      verifier.
- [x] Verify helper signs app args without `_trellisForwarding`,
      `_trustedForwardingKey`, `_trustedForwarding`, or `__trellis`.
- [x] Verify helper does not place principal or delegation in public app args.
- [x] Keep helper out of broad public barrels until the production verifier
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

- [x] RFC review blockers are resolved in `meta/rfc-forwarding-envelope.md`.
- [x] Canonical args hashing has precise tests and top-level-only metadata
      exclusion.
- [x] Verifier rejects wrong audience, issuer, function ref, purpose, transport,
      unknown `kid`, wrong `alg`, invalid signature, expired token, excessive
      TTL, oversized envelope, args drift, and replay.
- [x] Production/default mode rejects raw forwarding fields.
- [x] Production/default mode rejects mixed signed/raw forwarding fields.
- [x] Operation-execute replay redemption is atomic at the backend execution
      boundary.
- [x] Verification errors remain redacted.
- [x] Forwarding benchmark still runs and records a baseline without becoming a
      flaky hard gate.
- [x] No new compatibility shim is added.

## Exit Notes To Capture

- [x] HS256 remains the accepted alpha/production-candidate implementation for
      this sprint. Final acceptance still depends on the named external
      security-aware review.
- [x] Dev/test raw fallback remains only in
      `src/runtime/trusted-forwarding/shared.ts` for non-production callers and
      is counted through a redacted internal counter.
- [x] Current destructive confirmation/replay storage is sufficient for the
      operation-execute replay identity, but the first-party production store
      sprint is still needed for the broader MCP ingress/rate-limit defaults.
- [x] Next sprint can now migrate server/MCP/bridge callers to signed-only
      forwarding, with Ginko raw bridge forwarding as the cross-repo proof.
