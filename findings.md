# Trellis v2.2 Spec Validation — Findings

**Branch:** `trellis-testing`
**Date:** 2026-04-16
**Goal:** Validate all risky spec assumptions with real code before starting the refactor.

---

## Experiment 1: Crypto in Convex Runtime (BLOCKER)

**Status:** PASS

### What was tested
HKDF key derivation (`@noble/hashes`) and JWT sign/verify (`jose` with HS256) inside Convex mutations running in V8 edge runtime — no `"use node"` directive.

### Results
- **HKDF works**: `hkdf(sha256, rootSecret, salt, info, 32)` produces correct 32-byte derived keys.
- **JWT sign+verify works**: `new SignJWT({...}).sign(derivedKey)` and `jwtVerify(token, derivedKey, { audience })` both work with raw `Uint8Array` keys — no `crypto.subtle.importKey` needed.
- **Full pipeline works**: HKDF derive → sign JWT → verify → extract claims — all in one mutation.
- **Verification failures work correctly**: Wrong key, wrong audience, and expired tokens all throw as expected.

### Spec impact
**Import path fix needed:** `@noble/hashes` v2.x requires `.js` suffix in import specifiers (`@noble/hashes/hkdf.js`, `@noble/hashes/sha2.js`). The spec references `@noble/hashes/sha256` — the correct subpath in v2.x is `@noble/hashes/sha2.js` (exports `sha256`). Update spec §25.1.

**jose accepts raw Uint8Array:** No need for `crypto.subtle.importKey()` — `jose` accepts raw byte arrays directly for HS256 signing/verification. This simplifies the spec's crypto section.

### Notes
- Performance is sub-millisecond in test environment — well within Convex limits.
- The `sha256` convenience re-export at `@noble/hashes/sha256` does NOT exist in v2.x. Must use `@noble/hashes/sha2.js`.

---

## Experiment 2: Three-Door DB Model + Trigger Composition

**Status:** PASS (with critical composition order finding)

### What was tested
Creating three database wrappers with different RLS/trigger compositions in the same mutation:
- `db` = RLS + triggers
- `unsafeDb` = triggers only (no RLS)
- `rawDb` = nothing (raw `ctx.db`)

### Results
- **All three doors work independently** — writes, reads, RLS enforcement, trigger firing all behave as expected.
- **RLS deny works**: Writing with wrong org through `db` throws `"insert access not allowed"`.
- **`unsafeDb` bypasses RLS**: Same write succeeds through triggers-only door.
- **`rawDb` bypasses everything**: No triggers fire for raw writes.
- **Trigger count correct**: Only door1 + door2 writes fire triggers (2 entries). Door3 (raw) does not.
- **Two `wrapDB` calls don't interfere**: Multiple trigger-wrapped dbs in the same mutation work independently.

### Critical finding: Composition order matters

**Wrong order:** `triggers.wrapDB({ db: wrapDatabaseWriter(ctx, ctx.db, rules) })`
- Trigger's `ctx.innerDb` = RLS-wrapped db
- Trigger callbacks **cannot** write to tables not in the RLS rules (e.g., audit logs)
- This breaks the spec's audit/trigger story

**Correct order:** `wrapDatabaseWriter(ctx, triggers.wrapDB(ctx).db, rules)`
- RLS wraps the trigger-wrapped db (RLS on outside, triggers on inside)
- Trigger's `ctx.innerDb` = raw db
- Trigger callbacks **can** write to any table (audit logs, etc.)
- RLS still enforces on external callers

### Spec impact
**Update composition documentation.** The spec must mandate the correct composition order:
```
db = RLS( triggers( raw ) )        // NOT triggers( RLS( raw ) )
unsafeDb = triggers( raw )
rawDb = raw
```

This means:
1. `const triggerCtx = triggers.wrapDB(ctx)` — triggers wrap raw db first
2. `const db = wrapDatabaseWriter(ctx, triggerCtx.db, rules)` — RLS wraps triggers
3. Write flow: caller → RLS check → trigger wrapper → raw db
4. Trigger callback: gets raw db via `ctx.innerDb`, can write audit/log tables freely

---

## Experiment 3: Value-Based ctx + Raw DB Resolution

**Status:** PASS

### What was tested
Eager resolution of principal + actor in `customQuery`'s `input` phase, appearing as plain values (not async accessors) on the handler's `ctx`.

### Results
- **Principal is a value**: `typeof ctx.principal === 'object'` — confirmed.
- **Actor is a value**: `typeof ctx.actor === 'object'` — confirmed.
- **Raw db works for resolution**: Actor resolver reads `users` table via raw `ctx.db` without RLS interference.
- **RLS captures actor value in closure**: `buildTenantRules(actor)` correctly scopes queries to the actor's tenant.
- **Required-actor query throws for anonymous**: `trellisQuery` (actor required) throws `"Unauthorized: actor required"` when called without auth.
- **Public query allows null actor**: `trellisPublicQuery` returns `{ principalKind: 'anonymous', actorIsNull: true }` when called without auth.
- **Mutation with RLS-wrapped db**: Write via `trellisMutation` succeeds, post created with correct org.

### Spec impact
**No changes needed.** The spec's `ctx.actor` (value, not accessor) pattern works exactly as designed. The `customQuery`/`customMutation` `input` callback is the correct place for eager resolution.

---

## Experiment 4: Atomic Execute Mutation

**Status:** PASS

### What was tested
The spec's destructive MCP flow — 10 steps in one Convex mutation transaction:
1. JWT verification (HKDF-derived key)
2. Claim extraction (argsHash, previewHash, jti, callee)
3. Callee binding check
4. Args hash re-computation + comparison
5. Post reload (re-run load)
6. Preview hash re-computation + drift detection
7. JTI replay check (index lookup)
8. JTI redemption (write to `expJtiLog`)
9. Handler execution (delete post)
10. Audit log write

### Results
- **Happy path**: preview → token → execute → post deleted, audit written, jti redeemed. All 10 steps complete atomically.
- **Replay attack blocked**: Same token used twice → `"jti already redeemed"` on second attempt.
- **Preview drift detected**: Changing post title between preview and execute → `"Preview hash mismatch"` error. Post NOT deleted.
- **Args tampering detected**: Executing with different postId than preview → `"Args hash mismatch"` error. Both posts preserved.
- **Expired token rejected**: Token with past expiration → jose verification throws.

### Spec impact
**No architecture changes needed.** The 10-step atomic execute flow works within a single Convex mutation. All failure modes (replay, drift, tampering, expiration) behave correctly.

**Note on hash function:** The experiment used `btoa()` for hashing. Production should use `crypto.subtle.digest('SHA-256', ...)` or `@noble/hashes` for collision resistance. The full base64 is needed — truncation can cause collisions with similar Convex IDs.

---

## Experiment 5: RLS + Pagination Interaction

**Status:** PASS

### What was tested
Whether `.paginate()` works correctly through `wrapDatabaseReader` with RLS filtering.

### Results
- **RLS pagination works**: Paginating through RLS-wrapped db returns only posts matching the tenant filter. Collected all pages = exactly 10 posts (out of 20 total).
- **Raw pagination sees everything**: Same dataset, raw db pagination = 20 posts.
- **Cursor continuity preserved**: Multiple pages via cursor — no duplicates, all results from correct org.
- **Page sizes may be smaller**: When RLS filters rows, a page requested with `numItems: 10` may return fewer items. This is expected behavior — the underlying page fetches N items, then RLS filters, resulting in ≤N items returned.

### Spec impact
**Document the page-size behavior.** When RLS filters rows post-fetch, page sizes may be smaller than requested. This is not a bug — it's inherent to post-fetch filtering. Apps should paginate until `isDone` rather than assuming exact page sizes.

Consider mentioning `convex-helpers` `paginator` as an alternative that handles this more gracefully (it can re-fetch to fill pages).

---

## Experiment 6: Service Principal Structural Detection

**Status:** PASS

### What was tested
That separate `customQuery` builders for public vs internal endpoints can structurally determine the principal type at definition time (not at runtime via heuristics).

### Results
- **Public query, no auth → `anonymous`**: Confirmed. `customQuery(rawQuery, ...)` resolves to `{ kind: 'anonymous' }`.
- **Public query, with auth → `user`**: Confirmed.
- **Internal query, no auth → `system`**: Confirmed. `customQuery(rawInternalQuery, ...)` resolves to `{ kind: 'system' }`.
- **Internal query, with auth → `user`**: Confirmed.
- **Public mutation, no auth → `anonymous`**: Confirmed.
- **Internal mutation, no auth → `system`**: Confirmed.

### Spec impact
**No changes needed.** The structural approach works — builder type determines resolution path at definition time. This is not a runtime heuristic; it's baked into which base function (`rawQuery` vs `rawInternalQuery`) the custom builder wraps.

---

## Experiment 7: Build-Time AST Walk for Operations Manifest

**Status:** PASS (with documented limitation)

### What was tested
Using TypeScript Compiler API to statically find `defineOperation` calls in source files and extract metadata (name, kind, args field names).

### Results
- **Single operation extraction**: Works. Finds `defineOperation(...)`, extracts `kind`, `name`, `args` fields.
- **Multiple operations per file**: Works. All operations found with correct metadata.
- **Non-operation exports ignored**: `query(...)`, plain functions, etc. are correctly skipped.
- **Name fallback**: When no explicit `name` property, falls back to the export variable name.
- **Nested args**: Object literal args with multiple fields all extracted correctly.

### Documented limitation
- **Aliased imports not resolved**: `import { defineOperation as defOp }` is NOT followed. The walker looks for the literal identifier `defineOperation`. This is an acceptable limitation — we can lint against aliasing, or add import-binding tracking later.

### Spec impact
**No changes needed.** The manifest can be generated at build time via AST walk. The limitation on aliased imports is minor — a lint rule can enforce `defineOperation` is always imported with its original name.

---

## Summary: Go/No-Go Decision Matrix

| Exp | Risk | Status | Spec Impact |
|-----|------|--------|-------------|
| 1 (crypto) | **BLOCKER** | **PASS** | Fix import paths (`.js` suffix), simplify crypto docs (jose accepts raw bytes) |
| 2 (three doors) | High | **PASS** | **Critical:** Mandate correct composition order `RLS(triggers(raw))` |
| 3 (value ctx) | High | **PASS** | None — works as designed |
| 4 (atomic execute) | High | **PASS** | None — 10-step flow works atomically |
| 5 (pagination) | Medium | **PASS** | Document page-size behavior with RLS filtering |
| 6 (service principal) | Low | **PASS** | None — structural detection works |
| 7 (AST walk) | Low | **PASS** | None — aliased import limitation is acceptable |

## Verdict

**All experiments PASS. The spec holds up. Ready to start the refactor.**

Key changes to make to the spec before starting:
1. Fix `@noble/hashes` import paths to v2.x format (`.js` suffix, `sha2` not `sha256`)
2. Document correct composition order: `RLS(triggers(raw))` — this is critical
3. Note that `jose` accepts raw `Uint8Array` keys directly (no `crypto.subtle.importKey` needed)
4. Document RLS + pagination page-size behavior
5. Enforce `defineOperation` import name via lint rule (no aliasing)
