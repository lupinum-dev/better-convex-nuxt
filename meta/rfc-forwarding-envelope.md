# RFC: Trusted Forwarding Envelope

Status: alpha decision baseline
Owner: Matthias
Reviewer: TBD security-aware reviewer outside the implementation author

## Purpose

Replace raw trusted-forwarding args and shared-key identity injection with a
short-lived signed envelope.

A valid envelope authenticates the forwarding boundary. It does not grant
permission. Convex-side actor resolution, tenant checks, guards, load,
authorization, and handler logic remain authoritative.

## Non-Goals

- Hide identity payloads from all observers. The envelope is an integrity
  mechanism, not confidentiality.
- Authorize app work by token possession.
- Make app-defined actor resolvers safe when they are weak.
- Support arbitrary custom forwarding formats in 1.0.

## Proposed Shape

Alpha uses compact JWS-like `HS256`:

```text
base64url(header).base64url(payload).base64url(signature)
```

The HMAC key is read from `CONVEX_TRUSTED_FORWARDING_KEY`. The key id is read
from `CONVEX_TRUSTED_FORWARDING_KEY_ID` when set and otherwise defaults to
`default`. During alpha, verification accepts the configured key id and
`default` for the same HMAC key so local rotation experiments can prove the
shape without a multi-key store.

The production RFC may keep HMAC or move to an asymmetric signature. If it
changes the algorithm, the decision must name the operational tradeoff: key
distribution, rotation, local development, bridge/package callers, and verifier
deployment.

## Payload Fields

Required fields:

- `v`
- `kid`
- `iss`
- `aud`
- `jti`
- `sub`
- `principal`
- `transport`
- `purpose`
- `functionRef`
- `argsHash`
- `issuedAt`
- `expiresAt`

Optional fields:

- `delegation`

## Validation Requirements

Verification must check:

- envelope shape and supported version;
- signing algorithm;
- known `kid`;
- signature;
- issuer and audience;
- function ref wherever the transport edge knows the expected Convex function
  identity;
- args hash;
- issued/expiry timestamps with bounded skew;
- purpose-specific replay policy;
- principal payload validator based on existing canonical subject extraction;
- delegation payload validator based on existing canonical subject extraction
  when present;
- maximum serialized envelope size.

Invalid envelope errors must be classified without logging raw principal,
delegation, bearer tokens, or envelope payloads.

Alpha protected handlers accept internal `trustedForwardingFunctionRef` metadata
on the Convex function definition. When present, handler setup verifies the
signed envelope against that exact function ref before principal, actor, guard,
load, authorize, or handler execution.

## Canonical Args Hash

The RFC must define deterministic serialization for Convex values.

The Phase 0 spike currently:

- sorts object keys;
- omits object properties with `undefined`;
- serializes array `undefined` as `null`;
- excludes `_trellisForwarding`;
- excludes legacy `_trustedForwardingKey` and `_trustedForwarding`;
- excludes reserved public identity fields `principal` and `delegation`;
- excludes `__trellis`.

The production RFC must include test vectors for:

- nested objects with different key order;
- arrays containing nullish values;
- optional fields omitted versus present;
- Convex IDs as strings;
- excluded forwarding metadata;
- unsupported values.

Phase 0 vectors:

| Label             | Canonical Args                                                                | SHA-256 Base64url Hash                        |
| ----------------- | ----------------------------------------------------------------------------- | --------------------------------------------- |
| metadata excluded | `{"a":{"b":true},"z":1}`                                                      | `EfLFajqAf5JyfYGFIP9-L2OuKX0xG0gC8pMA6gq-NG8` |
| nullish array     | `{"items":[1,null,null,{"a":1,"b":2}]}`                                       | `llnIMe-pmO8r5f4mT1zediumV9Vqfj9QS-QSjJKUB2Q` |
| ID string         | `{"id":"j97f8x2v6k1c9e3w4q5r6t7y8h9m0n1p","nested":{"alpha":"a","beta":"b"}}` | `0Y9VM_pkQA_MgpEd_79yEjt1iTnJlGcEa24ihRm19eQ` |

## TTL And Replay Matrix

Alpha policy:

| Purpose             | Max TTL | Replay                       |
| ------------------- | ------- | ---------------------------- |
| `query`             | 60s     | TTL only                     |
| `mutation`          | 30s     | TTL only                     |
| `action`            | 30s     | TTL only                     |
| `operation-preview` | 30s     | TTL + rate limit             |
| `operation-execute` | 10s     | one-time redemption required |

Alpha exposes a replay redemption hook in trusted-forwarding context setup.
Only `operation-execute` is required to use one-time redemption in alpha. Other
purposes may add redemption later if the security review or production data says
they need it.

Backend destructive operation execution already uses the destructive safety
redemption table as the first-party one-time confirmation redemption path. The
alpha `operation-execute` forwarding path shares the confirmation token `jti`
so forwarding replay and confirmation replay stay one source of truth.
During Convex protected handler setup, `operation-execute` envelopes are checked
against that redemption table before principal, actor, guard, load,
authorization, or handler execution. The destructive operation handler remains
the canonical place that redeems/inserts the `jti` during successful execution.

If the chosen algorithm cannot meet the initial performance target, the RFC must
record the measured cost and justify the tradeoff.

Phase 0 benchmark command:

```bash
node scripts/bench-forwarding-envelope.mjs
```

Local result on 2026-05-09 for the HMAC spike:

```json
{
  "benchmark": "trusted-forwarding-envelope.verify",
  "iterations": 20000,
  "algorithm": "HS256 phase0 spike",
  "p50Ms": 0.0079,
  "p95Ms": 0.0129,
  "p99Ms": 0.062,
  "maxMs": 2.1461
}
```

## Production Stores

Production-safe forwarding must name first-party store paths for:

- destructive confirmation redemption;
- forwarding replay redemption where required;
- MCP ingress rate limiting.

Custom stores must have self-tests for atomic redeem/check, expiry, concurrent
use, clock skew behavior, idempotency, and failure mode behavior.

## Phase 0 Boundary

Phase 0 may keep throwaway or fixture-only envelope spikes before RFC sign-off.
Production implementation, public API freeze, and migration work must wait for
this RFC to be reviewed and accepted.

Alpha transport support accepts `_trellisForwarding` first and falls back to the
legacy raw `_trustedForwardingKey` / `_trustedForwarding` fields so current
callers keep working during migration. This fallback is explicitly temporary and
does not change the security rule: a valid envelope authenticates forwarding
only. It never grants permission.
