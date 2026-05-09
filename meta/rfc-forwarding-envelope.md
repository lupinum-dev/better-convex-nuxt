# RFC: Trusted Forwarding Envelope

Status: draft skeleton
Owner: TBD before Phase 0 sign-off
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

The Phase 0 spike uses a compact JWS-like shape:

```text
base64url(header).base64url(payload).base64url(signature)
```

The production RFC must decide whether this remains HMAC-signed or moves to an
asymmetric signature. The decision must name the operational tradeoff: key
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
- function ref;
- args hash;
- issued/expiry timestamps with bounded skew;
- purpose-specific replay policy;
- principal payload validator;
- delegation payload validator when present;
- maximum serialized envelope size.

Invalid envelope errors must be classified without logging raw principal,
delegation, bearer tokens, or envelope payloads.

## Canonical Args Hash

The RFC must define deterministic serialization for Convex values.

The Phase 0 spike currently:

- sorts object keys;
- omits object properties with `undefined`;
- serializes array `undefined` as `null`;
- excludes `_trellisForwarding`;
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

Initial policy target:

| Purpose             | Max TTL | Replay                       |
| ------------------- | ------- | ---------------------------- |
| `query`             | TBD     | TTL only                     |
| `mutation`          | TBD     | depends on safety class      |
| `action`            | TBD     | depends on side-effect class |
| `operation-preview` | TBD     | TTL + rate limit             |
| `operation-execute` | TBD     | one-time redemption required |

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
  "p50Ms": 0.0077,
  "p95Ms": 0.013,
  "p99Ms": 0.0236,
  "maxMs": 1.2096
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
