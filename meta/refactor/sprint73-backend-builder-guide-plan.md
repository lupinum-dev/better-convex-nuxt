# Sprint 73: Backend Builder Guide 1.0 Rewrite

## Summary

Continue Slice 12 by giving backend handler authoring one clear 1.0 guide.

The starter ladder now points users into real app code. The next doc gap is the
backend builder model itself: `defineTrellis(...)`, explicit public/protected/
unsafe lanes, typed unsafe permits, and when to stay on a normal handler instead
of reaching for operations.

## Why This Sprint

The API reference lists backend exports, but it is not the best place to teach
the trust lanes. If readers learn backend authoring only from scattered examples,
old mental models creep back in: callable root builders, accidental public
handlers, `guard: open`, unsafe string bypasses, or operations for every write.

This sprint should create one task guide and link to it from the reference and
permissions entry points.

## Non-Goals

- Do not change backend runtime code.
- Do not rewrite the operation/destructive safety guide in this sprint.
- Do not rewrite the full public API reference.
- Do not add compatibility docs for old builder spellings.
- Do not teach bridge or MCP as part of normal backend handler authoring.

## Action Plan

### 1. Establish The Backend Docs Baseline

- [x] Scan current user-facing docs for backend-builder shape:

  ```bash
  rg -n "query\\(|mutation\\(|action\\(|query\\.public|query\\.protected|mutation\\.public|mutation\\.protected|mutation\\.unsafe|query\\.unsafe|guard: open|bypass:|unsafe\\.permit|@lupinum/trellis/functions|defineTrellis" apps/docs/content/docs README.md examples -g '*.md'
  ```

- [x] Classify hits as current builder docs, legitimate call-site syntax, MCP
      tool syntax, stale old builder syntax, or false positive.
- [x] Record the baseline in this plan before editing.

Baseline: no user-facing `guard: open`, string `bypass:`, or
`@lupinum/trellis/functions` hits remain. `defineTrellis(...)`,
`query.public(...)`, `mutation.public(...)`, `query.protected(...)`,
`mutation.protected(...)`, and unsafe-lane hits are current 1.0 docs.
Remaining broader `query(...)` / `mutation(...)` hits are legitimate
client/server/test/MCP/Convex DB call syntax or operation registration examples,
not stale callable-root backend builder docs.

### 2. Add The Backend Builder Guide

- [x] Add one guide page under permissions or an adjacent guide section.
- [x] Teach `@lupinum/trellis/backend` as the only backend import path.
- [x] Teach `defineTrellis(...)` as returning lane containers, not callable root
      builders.
- [x] Teach explicit lanes:
      `query.public`, `mutation.public`, `query.protected`,
      `mutation.protected`, and unsafe lanes.
- [x] Explain public versus protected behavior in junior-readable terms.
- [x] Explain protected pipeline:
      principal -> actor -> guard -> load -> authorize -> handler.
- [x] Explain unsafe lanes as typed-permit escape hatches, and prefer
      `ctx.db.escapeTenantIsolation({ reason })` when only tenant scoping needs
      to be crossed.
- [x] Explain operations as a later step for preview/reuse/destructive work, not
      the default mutation shape.

### 3. Link The Guide From Existing Pages

- [x] Link from `apps/docs/content/docs/13.api-reference/3.functions.md`.
- [x] Link from `apps/docs/content/docs/08.permissions/1.setup.md` or another
      first permissions page if useful.
- [x] Do not add link clutter to the front door unless needed.

### 4. Remove Stale Builder Wording If Found

- [x] Delete docs that imply `query({ ... })` or `mutation({ ... })` are valid
      Trellis backend builders.
- [x] Delete docs that imply `guard: open` or missing guard means public.
- [x] Delete docs that imply string `bypass` is valid unsafe metadata.
- [x] Leave legitimate `ctx.query(...)`, `convex.query(...)`,
      `tool.query(...)`, and `useConvexQuery(...)` examples alone.

### 5. Verify

- [x] `pnpm run check:docs:links`
- [x] `pnpm run check:docs:api-surface`
- [x] `pnpm run check:repo-policies`
- [x] Backend builder scan from step 1 has no stale old-builder hits, or every
      remaining hit is documented here as intentional.
- [x] `pnpm exec oxfmt --check apps/docs/content/docs/08.permissions apps/docs/content/docs/13.api-reference/3.functions.md meta/refactor/sprint73-backend-builder-guide-plan.md meta/trellis-1.0-refactor-plan.md`
- [x] `git diff --check`

### 6. Update The Refactor Tracker

- [x] Add a Sprint 73 completion note to
      `meta/trellis-1.0-refactor-plan.md`.
- [x] Mark Backend builder guide complete only if the new guide is linked and
      verified.
- [x] Leave operation/destructive safety, MCP projection, trusted forwarding,
      bridge package-author, and full public API reference items open.

## Done Means

- Backend handler authors have one current 1.0 guide.
- Docs do not teach old root builder calls, `guard: open`, or string unsafe
  bypasses as supported.
- API reference stays a reference; the new guide owns the explanation.
