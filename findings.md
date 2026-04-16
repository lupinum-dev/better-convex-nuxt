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

---

## Experiment 8: Trellis-Owned Scope Proxy

**Status:** PASS

### What was tested
Whether Trellis should own its RLS layer using index-based scoping instead of relying on convex-helpers' post-fetch filtering. Four approaches were compared:

- **Approach A (Auto-Index):** Proxy's `.query()` auto-applies `.withIndex('by_organization', q => q.eq('organizationId', scopeValue))` for scoped tables.
- **Approach B (Compound-Index Only):** Proxy intercepts `.withIndex()` on compound indexes and auto-prepends the scope field. **Blocks** non-compound indexes.
- **Approach C (Post-Fetch Filter):** Same as convex-helpers `wrapDatabaseReader` — baseline comparison.
- **Approach D (Hybrid):** Auto-index for simple queries. When user specifies `.withIndex()`: use their index + Convex native `.filter()` for scope. Compound indexes still get the prepend optimization. **No restrictions on which indexes users can use.**

Also tested: write enforcement (insert/patch/delete), `.get()` scope check, trigger auto-scoping from document, non-scoped table passthrough.

### Results

**8a — Pagination (Auto-Index vs Post-Fetch Filter):**
- Both approaches returned correct results in convex-test.
- In convex-test, pagination is simulated, so the page-size difference doesn't manifest. In production Convex, the filter approach fetches N rows then filters (pages may be smaller), while the index approach only fetches matching rows (full pages guaranteed).
- Auto-index approach correctly scoped all 10 org1 posts across 2 pages of 5.

**8b — Compound Index Proxy:**
- **Compound index query works.** `proxy.query('posts').withIndex('by_org_status', q => q.eq('status', 'published'))` — the proxy automatically prepends `.eq('organizationId', scopeValue)`. Returned exactly 5 published posts from org1, zero from org2.
- **Non-compound indexes blocked.** Using `.withIndex('by_status', ...)` on a scoped table throws: `"not registered as a compound index"`. This prevents accidental cross-tenant data leaks via non-scoped indexes.
- **Auto-fallback works.** When no `.withIndex()` is called, the proxy auto-applies the scope index. Returned all 10 org1 posts.

**8c — Write Enforcement:**
- Insert with correct scope: **succeeds**
- Insert with wrong scope: **throws** `"Scope violation on insert"`
- Patch own document: **succeeds**
- Patch foreign document: **throws** `"Scope violation on patch"`
- Delete own document: **succeeds**
- Delete foreign document: **throws** `"Scope violation on delete"`
- `.get()` on foreign document: **returns null** (treated as not found)

**8d — Trigger Auto-Scoping:**
- **This is the key finding.** Triggers can read the scope field from the triggering document (`change.newDoc ?? change.oldDoc`) and build a scoped proxy from `ctx.innerDb`.
- Org1 trigger saw **1 post** (only the newly inserted post in org1).
- Org2 trigger saw **4 posts** (3 pre-existing + 1 new in org2).
- **Different triggers on different orgs see different data.** Document-scoped auto-scoping works correctly.
- Audit writes via raw `ctx.innerDb` (to `expTriggerLog`) still work — unscoped tables pass through.

**8e — Non-Scoped Tables:**
- Insert, get, and query on `notes` (not in scope config) all pass through transparently. No interference from the proxy.

### Spec impact

**Major architecture decision: Trellis should own its scope layer.**

The Compound-Index Proxy (Approach B) is the final approach. Exp 9 explored an additional `trellisTable()` schema wrapper to auto-compound indexes invisibly; **that wrapper was rejected after review** (see SPEC.md §30.28). The final shape:

1. **All custom indexes on scoped tables start with the scope field** — users write this explicitly (e.g., `.index('by_org_status', ['organizationId', 'status'])`).
2. **The proxy prepends the scope value at call time** — user writes `.withIndex('by_org_status', q => q.eq('status', 'published'))`, proxy runs `.eq('organizationId', scopeVal).eq('status', 'published')`.
3. **Non-compound indexes on scoped tables throw at runtime** with a pointer at the fix; eslint flags the same violation at authoring (`trellis/scoped-index-must-be-compound`).
4. **Every query is index-optimized** — full page sizes guaranteed, O(tenant rows) not O(all rows).
5. **Schema stays vanilla Convex** — plain `defineTable`, no wrapper to remember.

**What this replaces:**
- `convex-helpers/server/rowLevelSecurity` (`wrapDatabaseReader`, `wrapDatabaseWriter`)
- `defineTrigger` wrapper — unnecessary when the framework auto-scopes triggers
- `trellis/no-raw-trigger-register` lint rule — no raw registration to misuse
- Composition order documentation — nothing to compose manually
- "The trigger-scope problem" subsection — eliminated at the framework level

**What we keep from convex-helpers:**
- `Triggers` class — solid plumbing for before/after mechanics and recursion prevention
- `customQuery` / `customMutation` — builder pattern

**Why not `trellisTable()`:**
A schema wrapper that auto-compounds indexes would make the compound-index rule unforgettable, but at the cost of a second authoring API for tables, hidden behavior (dashboard indexes differ from source), vendor lock-in at the schema layer, and ongoing maintenance against Convex's internals. The rule "compound indexes start with the scope field" is standard multi-tenant practice and fits in two lines of documentation. Keeping it explicit — backed by eslint + runtime checks — is cleaner than hiding it.

---

---

## Experiment 10: Envelope callee-binding roundtrip

**Status:** PASS

### What was tested
The full sign → verify flow for signed principal envelopes (§23.3), including callee-binding with the `"module:exportName"` string form. Validates that an envelope bound to function A cannot be replayed against function B, even with the same signing key.

### Results
- **Valid envelope verifies cleanly:** signature, `aud`, `callee`, `exp` all check. Principal payload extracted.
- **Callee mismatch rejected:** envelope bound to `posts:deletePost` throws when verified as `posts:createPost`. Error message names both.
- **Audience mismatch rejected:** envelope signed with `trellis:mcp-forwarded:v1` purpose fails verification as `trellis:component-principal:v1`. Different HKDF-derived keys catch it at the signature step.
- **`internal.*` function refs:** confirmed there is no public accessor for the ref's module-and-export name. The callee string must be supplied explicitly by the framework at build time.

### Spec impact
**Replace `fn._name` with the `"module:exportName"` string form throughout the spec.** Prior drafts showed `fn._name` in pseudo-code (§26); this couples Trellis to a Convex internal. Updated in §23.3 and §26.

---

## Experiment 11: `ctx.runAsService()` roundtrip

**Status:** PASS

### What was tested
The full chain from HTTP-action-like context → signed `trellis:trusted-caller:v1` envelope → internal mutation consuming `__principal` arg → principal resolver verifying envelope → handler seeing `ctx.principal = { kind: 'service', service: '...' }`.

### Results
- **Happy path:** action signs envelope bound to `expRunAsService:recordPayment`, internal mutation verifies, `ctx.principal.service === 'stripe-webhook'`, audit row written.
- **Tampered envelope:** JWT signature invalidated → internal mutation throws → mutation rolls back, no audit row.
- **Wrong callee:** envelope bound to a different function → verifier throws `"Callee mismatch"`. Cannot be replayed against `recordPayment`.
- **No envelope:** internal mutation falls back to `systemPrincipal` default (`{ kind: 'service', service: 'system' }`). This is the correct behavior for scheduler, cron, CLI, dashboard.

### Spec impact
**No architecture changes needed.** The `ctx.runAsService` → internal-mutation → principal resolver chain behaves exactly as §10.3 and §26 describe, with the callee string fix from Exp 10.

---

## Experiment 12: `__workspaceId` injection via `customQuery` input

**Status:** PASS

### What was tested
The workspace-switching pattern from §14.4 — the Nuxt module injects `__workspaceId` (from a cookie or header) as an extra arg; `customQuery`'s `input` step consumes it, scopes the actor resolver, and strips it before the handler sees args.

### Results
- **`__workspaceId` is consumed by `input`, not forwarded to the handler:** handler's `args` contains only handler-level fields. Confirmed by inspecting `Object.keys(args)` inside the handler.
- **Resolver scopes actor to the provided workspace:** actor's `workspaceId` matches the passed `__workspaceId`. Role is derived correctly.
- **Omitted `__workspaceId` resolves to default:** with no arg passed, resolver falls back to the user's first/default membership (app policy, not framework policy).
- **Mismatched workspace → actor null:** passing a `__workspaceId` the user doesn't belong to returns a null actor. The `query`/`mutation` builders throw `"Unauthorized: actor required"` downstream.

### Spec impact
**No changes needed.** `customQuery`'s `args` declaration is the mechanism — any arg declared in `args:` is consumed by `input` and stripped. §14.4 ("Workspace switching pattern") describes this correctly.

---

## Summary: Go/No-Go Decision Matrix

| Exp | Risk | Status | Spec Impact |
|-----|------|--------|-------------|
| 1 (crypto) | **BLOCKER** | **PASS** | Fix import paths (`.js` suffix), simplify crypto docs (jose accepts raw bytes) |
| 2 (three doors) | High | **PASS** | Superseded by Exp 8 — framework owns composition |
| 3 (value ctx) | High | **PASS** | None — works as designed |
| 4 (atomic execute) | High | **PASS** | None — 10-step flow works atomically |
| 5 (pagination) | Medium | **PASS** | Superseded by Exp 8 — index-based scoping gives full pages |
| 6 (service principal) | Low | **PASS** | None — structural detection works |
| 7 (AST walk) | Low | **PASS** | None — aliased import limitation is acceptable |
| 8 (scope proxy) | High | **PASS** | **Major:** Trellis owns the scope layer, eliminates trigger footgun |
| 9 (auto-compound) | Medium | **PASS** | Explored `trellisTable()` auto-compounding; rejected in favor of explicit compound-index rule (see Verdict) |
| 10 (envelope binding) | Medium | **PASS** | Callee-binding uses `"module:exportName"` string form, not `fn._name` |
| 11 (runAsService) | Medium | **PASS** | None — behaves exactly as §10.3/§26 describe |
| 12 (workspaceId inject) | Low | **PASS** | None — §14.4 pattern is accurate |

## Verdict

**All 12 experiments PASS (58 convex tests + unit tests for AST walk). Ready to start the refactor.**

Final decisions absorbed into the spec:

1. Fix `@noble/hashes` import paths to v2.x format (`.js` suffix, `sha2` not `sha256`).
2. `jose` accepts raw `Uint8Array` keys directly (no `crypto.subtle.importKey` needed).
3. Replace convex-helpers RLS with a Trellis-owned index-based scope proxy.
4. Trigger scoping is automatic — callback auto-scopes from `change.newDoc ?? change.oldDoc`. No `defineTrigger` wrapper.
5. **Compound-index rule stays explicit.** Users write compound indexes themselves on scoped tables (`['organizationId', 'status']`, not `['status']`). Enforced twice: eslint at authoring (`trellis/scoped-index-must-be-compound`), proxy at runtime. No `trellisTable()` schema wrapper — see 30.28 in the spec for the rationale.
6. Enforce `defineOperation` import name via lint rule (no aliasing).
7. Callee-binding uses the `"module:exportName"` string form, not `fn._name`.
8. `ctx.runAsService` + internal mutation principal resolver validated end-to-end.
9. `__workspaceId` injection via `customQuery` input validated; §14.4 pattern is accurate.
