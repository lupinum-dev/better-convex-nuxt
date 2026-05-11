# RFC: Trusted Forwarding Envelope

Status: 1.0 production-candidate baseline
Owner: Matthias
Reviewer: team-provided security-aware reviewer outside the implementation author

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
- purpose and transport when the verifier knows the expected call class;
- function ref wherever the verifier knows the expected Convex function identity.
  Production migration should make exact function-ref validation mandatory for
  every forwarding-protected handler;
- args hash;
- issued/expiry timestamps with bounded skew;
- `expiresAt - issuedAt` must not exceed the maximum TTL for the envelope
  `purpose`;
- purpose-specific replay policy;
- principal payload validator based on existing canonical subject extraction;
- delegation payload validator based on existing canonical subject extraction
  when present;
- maximum serialized envelope size. Alpha rejects envelopes larger than 8192
  bytes before payload verification.

Invalid envelope errors must be classified without logging raw principal,
delegation, bearer tokens, or envelope payloads.

Alpha protected handlers accept internal `trustedForwardingFunctionRef` metadata
on the Convex function definition. When present, handler setup verifies the
signed envelope against that exact function ref before principal, actor, guard,
load, authorize, or handler execution.

## Canonical Args Hash

Production forwarding uses deterministic serialization for the app args before
computing `SHA-256(canonicalArgs)` and encoding the digest as base64url.

The supported canonical value set is deliberately narrow: JSON-shaped Convex
args plus Convex IDs represented as strings. Unsupported values fail closed
instead of being coerced into hashes.

Canonicalization rules:

- object keys are sorted by deterministic JavaScript string comparison
  (`<` / `>`) at every object level;
- object properties with `undefined` are omitted;
- array `undefined` entries serialize as `null`;
- strings are serialized as JSON strings and hashed as UTF-8 bytes;
- finite numbers serialize with JSON number syntax;
- non-finite numbers and `-0` are rejected;
- booleans and `null` serialize as normal JSON literals;
- bigint/int64 values are not accepted as JavaScript `bigint`; callers must pass
  supported Convex integer values through an explicitly supported representation
  before signing;
- bytes/binary values are rejected; callers must pass an explicitly encoded
  string representation before signing;
- Date, Map, Set, class instances, functions, symbols, and other non-plain
  objects are rejected;
- only the top-level forwarding transport metadata keys are excluded before
  hashing: `_trellisForwarding`, legacy `_trustedForwardingKey`, legacy
  `_trustedForwarding`, and `__trellis`;
- nested business args with those names are still authenticated;
- top-level `principal` and `delegation` are authenticated business args, not
  excluded metadata. Server/MCP helpers must not put identity payloads in public
  app args; identity travels inside the signed envelope payload.

This last rule prevents a caller from adding or changing top-level
identity-shaped public args beside a valid envelope without causing args-hash
drift.

Phase 0 vectors:

| Label                       | Canonical Args                                                                                                                                                          | SHA-256 Base64url Hash                        |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| top-level metadata excluded | `{"a":{"b":true},"delegation":{"subject":"ignored"},"principal":{"subject":"ignored"},"z":1}`                                                                           | `iLSkFSs_EoAdiRE7_H-ndlsK9-8RIE6_tdcnvvSPAKM` |
| identity keys authenticated | `{"delegation":{"subject":"ignored"},"nested":{"delegation":"business","principal":"business"},"principal":{"subject":"ignored"},"z":1}`                                | `MPMtWV7R94A-_2iWrr6sIKZdAitV6matgP3ag5F5AH0` |
| nested metadata keys hashed | `{"nested":{"__trellis":{"trace":"business"},"_trellisForwarding":"business","_trustedForwarding":{"principalSubject":"business"},"_trustedForwardingKey":"business"}}` | `-0htiQFh9WsLXih-k-lOIaYuUN2EClu5SEDRMzAZkGs` |
| nullish array               | `{"items":[1,null,null,{"a":1,"b":2}]}`                                                                                                                                 | `llnIMe-pmO8r5f4mT1zediumV9Vqfj9QS-QSjJKUB2Q` |
| ID string                   | `{"id":"j97f8x2v6k1c9e3w4q5r6t7y8h9m0n1p","nested":{"alpha":"a","beta":"b"}}`                                                                                           | `0Y9VM_pkQA_MgpEd_79yEjt1iTnJlGcEa24ihRm19eQ` |

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
During Convex protected handler setup, `operation-execute` envelopes may be
prechecked against that redemption table only as an early denial. The
destructive operation handler remains the canonical place that atomically
redeems/inserts the `jti` during successful execution. That insert is the replay
claim and must happen before irreversible side effects or inside the same
backend transaction as destructive execution. A preflight “not already
redeemed” check is not sufficient by itself. Production implementations that
move destructive execution outside the same Convex mutation must provide an
equivalent atomic claim/redeem contract.
Execution also rejects an `operation-execute` envelope whose `jti` does not
match the destructive confirmation token `jti`; confirmation replay and
forwarding replay must stay one replay identity.

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
  "p95Ms": 0.0128,
  "p99Ms": 0.0463,
  "maxMs": 1.266
}
```

## Production Stores

Production-safe forwarding must name first-party store paths for:

- destructive confirmation redemption;
- forwarding replay redemption where required;
- MCP ingress rate limiting.

Alpha uses the existing Convex destructive safety tables as the first-party
confirmation/replay path for `operation-execute`:

```ts
destructiveRedemptions: defineTable({
  jti: v.string(),
  operationId: v.string(),
  principalKey: v.string(),
  tenantKey: v.string(),
  redeemedAt: v.number(),
}).index('by_jti', ['jti'])

destructiveAuditLog: defineTable({
  operationId: v.string(),
  jti: v.string(),
  principalKey: v.string(),
  tenantKey: v.string(),
  argsHash: v.string(),
  previewHash: v.string(),
  executedAt: v.number(),
  executePath: v.string(),
})
```

The `by_jti` lookup is the store contract for both confirmation replay and
`operation-execute` forwarding replay. Runtime checks must fail closed with a
destructive-safety misconfiguration error when the configured redemption table,
required redemption fields, `by_jti` index, audit table, or required audit
fields are missing. Doctor validates the schema shape statically; runtime
diagnostics cover miswired tests, fixtures, and deployments that skipped doctor.

Custom stores must have self-tests for atomic redeem/check, expiry, concurrent
use, clock skew behavior, idempotency, and failure mode behavior.

## Phase 0 Boundary

Phase 0 may keep throwaway or fixture-only envelope spikes before RFC sign-off.
Production implementation, public API freeze, and migration work must wait for
this RFC to be reviewed and accepted.

Alpha transport support accepts `_trellisForwarding` only. The legacy raw
`_trustedForwardingKey` / `_trustedForwarding` parser was kept only during local
migration and is deleted before 1.0. A valid envelope authenticates forwarding
only. It never grants permission.

## External Review Packet

External security review feedback has been received through the team review
process. The reviewer identity is tracked outside the repo; this RFC records the
accepted technical feedback and remaining production follow-up.

The review should answer these finite questions:

1. Is compact JWS-like `HS256` acceptable for alpha given that Nitro/server and
   Convex share `CONVEX_TRUSTED_FORWARDING_KEY`, or should production move to
   asymmetric signing before migration?
2. Are the TTL defaults appropriate: query `60s`, mutation/action `30s`,
   operation-preview `30s`, and operation-execute `10s`?
3. Is one-time replay redemption only for `operation-execute` sufficient for
   alpha, with query/mutation/action relying on TTL and backend authorization?
4. Are the narrowed Phase 0 canonical args hashing rules complete enough for
   JSON-shaped Convex args and Convex IDs as strings, and are the vectors
   sufficient to prevent drift between Nitro and Convex?
5. Does sharing the destructive confirmation token `jti` with the
   `operation-execute` forwarding envelope create one clear replay identity, or
   should confirmation replay and forwarding replay use separate IDs?
6. Are issuer/audience/function-ref checks enough to prevent cross-app,
   cross-deployment, and cross-function envelope reuse in the supported alpha
   deployment model?
7. Are principal/delegation validators based on canonical subject extraction
   strict enough, and what payload fields should be rejected before actor
   resolution?
8. Is deleting the raw forwarding fallback before 1.0 sufficient, or should the
   verifier also emit a dedicated redacted diagnostic when raw fields are seen
   as unexpected app args?
9. Are the redaction requirements sufficient to keep invalid envelope,
   principal, delegation, and bearer data out of logs and diagnostics?
10. Is the alpha maximum serialized envelope size of 8192 bytes appropriate for
    expected principal/delegation payloads?

## External Review Outcome For 1.0

The 1.0 production-candidate baseline accepts compact JWS-like `HS256` with a
high-entropy server-only key, strict algorithm allowlisting, exact issuer /
audience / function-ref / purpose checks, bounded TTL by purpose, deterministic
top-level-only args hashing, atomic `operation-execute` replay redemption,
principal/delegation validation, safe redaction, and no raw forwarding fallback.

Production follow-up remains explicit: revisit asymmetric signing once Trellis
has real multi-deployment or package-author pressure that justifies public-key
verification over the operational simplicity of the shared Convex/Nitro HMAC
secret.
