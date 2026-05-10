# Sprint 71: Docs Front Door 1.0 Rewrite

## Summary

Start Slice 12 by making the user-facing docs front door match the Trellis 1.0
shape that now exists in code.

The previous sprint proved the real Ginko consumer and packed package-consumer
fixture are healthy. The next blocker is not another backend cutover; it is the
docs a new user sees first. Those pages must teach the 1.0 mental model:
progressive starters, explicit backend lanes, signed forwarding, operation-backed
destructive MCP, and Ginko-owned CMS setup. They must not preserve old Trellis
0.x paths as supported options.

## Why This Sprint

The code has already hard-cut most public surfaces. Docs are now the highest-risk
remaining second source of truth. If they keep teaching old builder forms,
template-backed starters, raw forwarding, `tool.fromOperation(...)`, or Trellis
CMS setup, the implementation can be clean while the product still feels messy.

This sprint should rewrite only the first-reader docs and add a repeatable scan
for current docs. It should not become a full documentation rewrite.

## Non-Goals

- Do not rewrite every guide in `apps/docs/content/docs/**`.
- Do not update historical notes under `meta/**` except the tracker and this
  sprint plan.
- Do not change public API names to make docs easier.
- Do not preserve old names as "also supported" docs.
- Do not add compatibility guidance for unreleased 0.x paths unless the
  migration table already names that path.
- Do not touch Ginko product docs unless a Trellis docs page currently claims
  CMS setup ownership.

## Action Plan

### 1. Establish The Current Docs Baseline

- [x] Run a stale-surface scan over current user-facing docs:

  ```bash
  rg -n "tool\\.fromOperation|_trustedForwardingKey|_trustedForwarding\\b|@lupinum/trellis/functions|@lupinum/trellis/bridge|workspace --mcp|cms starter|trellis bridge|\\.tpl|query\\(|mutation\\(|guard: open|bypass:" README.md apps/docs/content apps/docs/STYLE.md examples -g '*.md'
  ```

- [x] Classify hits as:
      current user-facing stale docs, generated API surface, example docs,
      migration notes, or false positives.
- [x] Record the baseline in this plan before editing.
- [x] Do not treat `meta/refactor/**` or ADR history as current product docs.

Baseline: the full scan found no current docs/examples hits for
`tool.fromOperation`, raw forwarding fields, deleted bridge imports,
`workspace --mcp`, `cms` starter setup, root `trellis bridge`, `.tpl`,
`guard: open`, or unsafe `bypass:`. The only stale docs hit was
`apps/docs/content/docs/13.api-reference/3.functions.md` describing operation
projection as `mutation(operation)` instead of the 1.0
`mutation.protected(operation)` lane. The broader `query(...)` / `mutation(...)`
hits were legitimate client cache, Convex DB, testing caller, server caller, and
MCP tool examples rather than old backend builder syntax.

### 2. Rewrite The Front Door

- [x] Rewrite `README.md` only where it teaches old surfaces or fails to set the
      1.0 product expectation.
- [x] Rewrite `apps/docs/content/index.md` if it still reads like a generic
      landing page rather than the Trellis 1.0 entry point.
- [x] Rewrite `apps/docs/content/docs/01.getting-started/1.start-here.md` so the
      first path is:
      choose starter -> run fixture-backed starter -> use explicit backend lanes
      -> run doctor.
- [x] Add or preserve the "Should you use Trellis?" honesty:
      Trellis is for one reviewable backend model across browser, server,
      workspace, and agent surfaces; it is not just a Convex query helper.
- [x] Teach the canonical starters only:
      `public`, `personal`, `workspace`, and `workspace-mcp`.
- [x] Do not mention `cms` as a Trellis beginner starter.

`README.md` already matched the 1.0 expectation, so it was left untouched.
`apps/docs/content/index.md` now leads with fixture-backed `trellis init`, and
`start-here` now makes `trellis doctor` part of the first loop.

### 3. Tighten First-Reader Architecture Pages

- [x] Update `apps/docs/content/docs/02.concepts/1.how-it-works.md` only if it
      contradicts the current 1.0 model.
- [x] Update `apps/docs/content/docs/02.concepts/2.glossary.md` only for terms
      that changed names or ownership in 1.0.
- [x] Ensure the first-reader model says:
      principal -> actor -> guard/load/authorize -> handler remains backend
      authority.
- [x] Ensure signed forwarding is described as transport authentication, not app
      authorization.
- [x] Ensure MCP discovery is advisory and backend execution is authoritative.

The concepts page already taught backend authority and advisory transport
visibility. It now explicitly says a valid `_trellisForwarding` envelope
authenticates the forwarding boundary but does not grant permission.

### 4. Update Starter/Setup Docs Only Where Needed

- [x] Update `apps/docs/content/docs/01.getting-started/2.installation.md` if it
      teaches deleted starter names or template-backed generation.
- [x] Update starter index pages if they still imply `workspace --mcp` or `cms`.
- [x] Leave deeper guide rewrites for later sprints unless a link/check fails.

No installation/starter page edit was needed; the scan found no deleted starter
or template-backed generation wording.

### 5. Add Or Reuse A Docs Guardrail

- [x] If existing repo-policy/docs checks already catch stale first-reader
      surfaces, reuse them and document the command.
- [x] If they do not, add one narrow current-docs scan for deleted 1.0 public
      surfaces.
- [x] Exclude historical `meta/**` planning notes from the guardrail.
- [x] Do not add a broad scanner that flags legitimate generated API names or
      migration test fixtures without context.

`pnpm run check:repo-policies` already scans retained examples, `apps/docs`,
`apps/harness`, and `apps/devtools-ui` for deleted Trellis 1.0 surfaces. No new
guardrail was needed.

### 6. Verify

- [x] `pnpm run check:docs:links`
- [x] `pnpm run check:docs:api-surface`
- [x] `pnpm run check:repo-policies`
- [x] Stale-surface scan from step 1 returns no current user-facing deleted-path
      hits, or every remaining hit is documented here as intentional.
- [x] `pnpm exec oxfmt --check README.md apps/docs/content apps/docs/STYLE.md meta/refactor/sprint71-docs-front-door-1-0-plan.md meta/trellis-1.0-refactor-plan.md`
- [x] `git diff --check`

### 7. Update The Refactor Tracker

- [x] Add a Sprint 71 completion note to
      `meta/trellis-1.0-refactor-plan.md`.
- [x] Mark front-door docs items complete only for files actually rewritten and
      verified.
- [x] Leave deeper guide/API-reference items open unless this sprint edits and
      verifies them.

## Done Means

- First-reader docs teach Trellis 1.0, not Trellis 0.x plus migration residue.
- Current docs do not teach raw forwarding, `tool.fromOperation(...)`, deleted
  bridge imports, deleted starter names, or template-backed starter generation.
- The docs gate is repeatable through documented commands.
- The tracker honestly separates front-door docs completion from the larger docs
  rewrite.
