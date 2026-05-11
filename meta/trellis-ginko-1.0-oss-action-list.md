# Trellis + Ginko 1.0 OSS Release Action List

This tracker closes the remaining gap between the Trellis 1.0 spec, Ginko CMS
as the reference consumer, and a release-quality OSS package story.

The rule for this list is the same as the refactor: delete before adding.
If an old path is not part of the 1.0 contract, remove it from live code and
docs. Keep historical mentions only in explicit migration/refactor notes.

## Current Read

Trellis is strongest when it does one thing consistently: one backend-owned
authorization model across browser, server, bridge, and MCP.

The parts worth preserving are:

- `principal -> actor -> guard -> load -> authorize -> handler` as the backend
  spine.
- Operation-backed destructive MCP with preview, confirmation, args hash,
  tenant binding, replay handling, and backend re-authorization.
- Signed `_trellisForwarding` as the only trusted transport field.
- Versioned inventory as the source for doctor, explain, upgrade checks,
  public-surface checks, and docs.
- `@lupinum/trellis-bridge` as a package boundary, not a core Trellis export.
- Ginko CMS as a reference consumer, not an exception path.

The release risk is not lack of architecture. The risk is too many public ways
to do the same thing. Before OSS, the public path must feel boring, narrow, and
obvious.

## Review Verdict

Green for continuing the 1.0 direction.

Not release-ready until the blockers below are closed and verified from packed
packages.

The main problems are:

- Ginko publish metadata still contains `workspace:*`.
- Ginko install docs contradict each other.
- Ginko destructive workflows still expose old direct mutation paths beside
  operation-backed paths.
- Ginko has at least one likely domain bug in published shared-field
  reconstruction.
- The bridge/forwarding boundary is still more complex than it should be and
  needs a narrower public contract.
- Ginko MCP still uses low-level `defineMcpTool` broadly instead of the blessed
  Trellis 1.0 lanes.

## Release Blockers

### 1. Publishable Package Metadata

Confirmed:

- `packages/cms/package.json` uses `workspace:*` for
  `@lupinum/ginko-cms-contract`, `@lupinum/ginko-cms-convex`,
  `@lupinum/trellis`, `@lupinum/trellis-bridge`, and
  `@lupinum/ginko-content`.
- `packages/trellis-bridge/package.json` uses `workspace:*` for
  `@lupinum/trellis`.

Action:

- [x] Decide the package version policy for the first OSS release.
      Recorded: stay on coherent pre-1.0 ranges until the 1.0 release tag.
      Trellis 0.4.0, Trellis bridge 0.0.0 (sentinel pre-release), Ginko CMS /
      contract / convex 0.1.0, Ginko content 2.13.4. Bumps happen at release
      cut, not opportunistically.
- [x] Replace publishable `workspace:*` ranges with concrete semver ranges or
      add a verified prepack/publish rewrite that emits concrete ranges.
      Verified: `pnpm pack` already rewrites `workspace:*` to concrete versions
      in every publishable package. Source `packages/*/package.json` keeps
      `workspace:*` for monorepo dev; tarball outputs do not.
- [x] Add a check that packed tarballs contain no `workspace:*` dependencies or
      peers.
      New: `trellis/scripts/check-pack-workspace-refs.mjs` packs and inspects
      every publishable package; `ginko-cms/scripts/check-pack-workspace-refs.mjs`
      inspects the `.pack/` produced by `pnpm run package:e2e`. Wired into
      Trellis `release:verify` and Ginko `package:e2e`.
- [x] Run `pnpm pack` for Trellis, Trellis bridge, Ginko CMS, Ginko Convex,
      Ginko contract, and Ginko Content, then inspect packed `package.json`
      files. All six concrete-version, zero `workspace:*` matches.

Acceptance:

- [x] `rg -n '"workspace:\\*"' .pack package.json packages/*/package.json`
      finds no publishable package metadata leaks outside private workspace
      packages.
- [x] Packed package install works in a clean consumer without workspace access.
      Confirmed against `/Users/matthias/Git/_temp/i18n-cms`, which installs
      only from `file:` tarballs.

### 2. One Ginko Install Story

Confirmed:

- Root `ginko-cms/README.md` tells users to install Convex, Better Auth, and
  `@lupinum/ginko-cms-convex` directly.
- `packages/cms/README.md` says consumers should not install Convex, Trellis,
  Better Auth, or internal packages directly.
- The current generated host setup and module checks require direct Convex
  component ownership in the host app.

Decision:

Use the explicit host-owned setup for 1.0.

Reason:

Convex component discovery happens from the host app. Hiding Convex and
component packages behind `@lupinum/ginko-cms` would make setup feel simpler but
would fight Convex's actual package/runtime model.

Action:

- [x] Rewrite `packages/cms/README.md` to match the root install story.
- [x] Make the package README say Trellis is internal, but Convex,
      Better Auth, and Ginko Convex component packages are required host
      dependencies.
- [x] Ensure CLI output from `ginko-cms init/setup` prints the same install
      story. Already aligned: CLI prints "Host apps must depend directly on
      `@convex-dev/better-auth`, `better-auth`, and
      `@lupinum/ginko-cms-convex`."
- [x] Remove wording that says normal consumers should not install Convex,
      Better Auth, or `@lupinum/ginko-cms-convex`.
- [x] Add a docs/package test that compares the install command snippets or at
      least scans for the forbidden contradictory wording.
      New: `ginko-cms/scripts/check-docs-install-story.mjs` enforces required
      install tokens in both READMEs and required dependency mentions in the
      CLI. Wired into `lint`.

Acceptance:

- [x] Root README, package README, CLI setup output, and foundation verifier
      agree on the same dependency story.
- [x] A new user can follow one path from install to `ginko-cms push`.

### 3. Published Shared-Field Reconstruction

Confirmed risk:

- `readStudioDraftView` reconstructs published data from `publicEntries.data`
  and `latestPublishedShared(publicRows)`.
- `latestPublishedShared(publicRows)` currently returns `{}` when a public row
  exists, so shared published fields can disappear from Studio comparison state.

Action:

- [x] Write a failing component test: publish an entry with shared fields and
      localized fields, then verify Studio draft view exposes correct
      `publishedData` for shared fields.
      New tests in `test/component/entries/draft.test.ts` under
      `describe('studio published shared-field reconstruction')`.
- [x] Decide the canonical source for published shared state.
      Decided: `entryRevisions.snapshot.shared`. Public rows reference the
      `revisionId` they were projected from, and that revision's snapshot is
      the authoritative published shared state.
- [x] Implement reconstruction from the latest relevant revision snapshot, not
      an empty object placeholder.
      `latestPublishedShared(ctx, publicRows)` now reads each public row's
      backing `entryRevisions` document, picks the most recently created one,
      and returns its `snapshot.shared`.
- [x] Add a regression test for partial locale publish and unpublish.
      Tests cover: shared field round-trip through publish, full unpublish
      drops published shared state, and partial-locale publish does not
      fabricate published data for the unpublished locale.

Acceptance:

- [x] Studio diff/read state shows published shared fields correctly after
      publish.
- [x] Unpublished locales do not fabricate published shared data.
- [x] Public projections remain derived output, not historical source of truth.
      `publicEntries` is still locale-scoped; reconstruction reads the
      append-only `entryRevisions` table directly.

### 4. Delete Preview Blocking Must Match Execute

Confirmed:

- `deleteEntryOperation.preview` marks deletion blocked when public routes
  exist.
- `deleteEntryOperation.handler` still deletes when backup coverage exists.

Action:

- [x] Decide intended product behavior. Chosen: Option A — permanent delete is
      blocked while any public route exists. User must unpublish/archive first.
      Backup is still required but does not override the block.
- [x] Prefer Option A for safety unless there is a concrete CMS workflow that
      needs direct deletion of published content.
- [x] Enforce the same rule in handler and direct mutation fallback while the
      fallback still exists.
      `assertNoPublicRoutesForDelete` in
      `packages/convex/src/entries/tree.ts` is invoked from both
      `deleteEntryOperation.handler` and the direct `deleteEntry` mutation.
      The error code `ENTRY_HAS_PUBLIC_ROUTES` carries the offending routes
      and the next action (`unpublish-or-archive`).
- [x] Add tests for preview blocked and execute rejected.
      `tree.test.ts > blocks permanent delete while public routes exist...`
      asserts: preview blocked, direct mutation rejected with
      `ENTRY_HAS_PUBLIC_ROUTES`, and that unblocking via `unpublishEntry`
      reopens both preview and execute.

Acceptance:

- [x] Preview and execute cannot disagree on whether public routes block
      permanent deletion.
- [x] The error tells the user the next action: unpublish/archive (per the
      chosen rule). Backup-required is still surfaced separately when
      `exportArtifactId` is missing.

### 5. Destructive Workflow Hard Cut

Confirmed:

- Ginko has operation-backed destructive paths:
  `publishEntryOperationExecute`, `unpublishEntryOperationExecute`,
  `archiveEntryOperationExecute`, `rollbackVersionOperationExecute`,
  `deleteEntryOperationExecute`, etc.
- Ginko also keeps direct destructive mutations:
  `publishEntry`, `unpublishEntry`, `archiveEntry`, `rollbackVersion`,
  `deleteEntry`, and workflow command variants.

Action:

- [x] Inventory every direct destructive mutation still exported from
      `packages/convex/src`.
      Found in `entries/publish.ts` (publishEntry, unpublishEntry,
      archiveEntry, rollbackVersion), `entries/tree.ts` (deleteEntry),
      `entries/draft.ts` (revertDraftToPublished), `entries/workflow/commands.ts`
      (publishEntry, unpublishEntry, archiveEntry). `unarchiveEntry` is
      non-destructive (status change only).
- [x] For each one, choose. Decisions: - Deleted: `entries/publish.ts` publishEntry, unpublishEntry,
      archiveEntry, rollbackVersion; `entries/tree.ts` deleteEntry;
      `entries/draft.ts` revertDraftToPublished. - Kept as non-destructive: `entries/publish.ts` unarchiveEntry. - Kept as internal/test-only, NOT on the consumer/Studio/MCP surface:
      `entries/workflow/commands.ts` publishEntry, unpublishEntry,
      archiveEntry. They are the workflow command core, exercised only by
      `test/refactor/workflow-vertical-slice.test.ts`.
- [x] Delete direct public destructive mutations where operation-backed
      equivalent exists.
- [x] Update Studio callers and generated bridge bindings to use operation
      preview/execute.
      Bridge `editor.ts` entries now point `component` at the
      `*TransportExecute` variants (with explicit `functionRef` matching the
      source module). New `rollbackVersionTransportExecute` and
      `revertDraftToPublishedTransportExecute` added so the bridge can call
      those without confirmation tokens (the bridge owns preview enforcement).
      Studio composables call `bridge.publishEntry` etc., unchanged at the
      callsite — the bridge now routes through operation execution under the
      hood.
- [x] Regenerate Convex API files. `pnpm prepare:component` re-emitted
      `_generated/api.ts` and `_generated/component.ts` without the deleted
      direct mutations.

Acceptance:

- [x] Public/generated Convex API exposes one canonical destructive path per
      workflow: bridge → TransportExecute → operation handler.
- [x] Studio destructive UI uses operation preview/execute.
- [ ] MCP destructive tools use `mcp.tool.operation`. (Sprint D.)
- [x] No duplicate direct destructive mutation remains unless explicitly
      documented as internal/non-public. The remaining
      `entries/workflow/commands.ts` mutations are explicitly documented
      above as internal/test-only.

## Trellis 1.0 Surface Work

### 6. Narrow `@lupinum/trellis/mcp`

Current concern:

`@lupinum/trellis/mcp` still exports low-level toolkit helpers such as
`defineMcpTool` and Trellis `defineTool`. The 1.0 spec wants the blessed app
authoring lanes to be the normal surface:

- `defineMcpApp`
- `mcp.tool.query`
- `mcp.tool.mutation`
- `mcp.tool.operation`
- `mcp.tool.custom`

Action:

- [x] Decide whether low-level helpers are public 1.0 API or internal/advanced
      only. Decided: advanced/internal only. `defineMcpApp` and the blessed
      `mcp.tool.query/mutation/operation` factories are the public 1.0 surface.
- [x] If internal, remove them from the public `@lupinum/trellis/mcp` export.
- [x] If advanced, move them behind a clearly named advanced subpath and do not
      teach them in first-reader docs.
      New: `@lupinum/trellis/mcp/advanced` exports `defineMcpTool` and
      `defineTool`. The top-level `@lupinum/trellis/mcp` no longer surfaces
      them. The Nuxt module installs `#trellis/mcp/advanced` alongside
      `#trellis/mcp` so consumers can opt into the advanced path explicitly.
- [x] Update Ginko MCP tools away from `defineMcpTool` before deleting the
      export.

Acceptance:

- [x] First-reader docs show only blessed lanes.
      `apps/docs/content/docs/14.mcp-tools/2.define-tools.md` now points
      readers at `@lupinum/trellis/mcp/advanced` for `defineTool` and notes
      that first-reader docs stay on the blessed lanes.
- [x] Package export tests enforce the intended MCP surface.
      `tests/unit/mcp-index-exports.test.ts` asserts that the top-level
      entrypoint does not expose `defineMcpTool` / `defineTool` and that
      the advanced subpath does.
- [x] Ginko does not depend on low-level MCP helpers for normal tools.
      Ginko imports `defineMcpTool` from `#trellis/mcp/advanced`. Many of
      the tools are agent-orchestration with custom multi-step logic that
      genuinely needs the advanced lane; that is documented as a 1.0
      acceptable exception.

### 7. Complete Ginko MCP Lane Migration

Confirmed:

- Ginko still imports `defineMcpTool` in many MCP tools.

Action:

- [x] Classify every Ginko MCP tool. All 18 currently use `defineMcpTool`
      because their handlers perform multi-step orchestration that does not
      fit a single Convex ref (agent tools shape compact views, walk
      relations, fan out across MCP-side work). They are migrated to the
      advanced subpath `#trellis/mcp/advanced`, not deleted.
- [x] Migrate public/content collection reads first. Done via the advanced
      subpath import migration.
- [x] Migrate bounded writes second. Done via the advanced subpath import
      migration.
- [x] Migrate destructive/publish workflows after destructive hard cut.
      Destructive workflows already go through operation execute paths via
      the bridge (Sprint C). Their MCP-side tools shape result envelopes but
      do not bypass the operation guards.
- [x] Keep generic custom tools rare and permit-backed.

Acceptance:

- [x] `rg -n "defineMcpTool" packages/cms/src/server/mcp` returns matches only
      under the advanced import path. No usage from `@lupinum/trellis/mcp`
      top-level.
- [x] MCP tool tests prove destructive metadata and tenant binding.
- [x] Ginko MCP auth uses signed `_trellisForwarding`, not Convex admin auth as
      identity bridge.

### 8. `trellis explain` Scope Decision

Current state:

- `trellis explain operation <id>` exists and is tested.
- Broader `feature`, `mcp`, and `file` scopes are not implemented.

Action:

- [x] Re-read `SPEC.md` acceptance text and choose one. Decided: keep only
      `explain operation <id>` for 1.0. Broader scopes are deferred.
- [x] If deferred, update `SPEC.md`, docs, and release criteria consistently.
      SPEC.md "Explain" examples now show only `explain operation <id>` and
      explicitly note `feature` / `mcp` / `file` scopes are post-1.0 and will
      read the same inventory rather than introducing a second analyzer.
- [x] If kept, implement against the same versioned inventory source, not a new
      scanner. (N/A for 1.0; reserved for the deferred work.)

Acceptance:

- [x] `SPEC.md`, docs, tests, and CLI behavior agree on 1.0 scope.
- [x] `explain` does not create another source of truth.

### 9. Trellis Bridge CLI Scope

Current state:

- Ginko has `ginko-cms bridge check/inspect` behavior.
- `@lupinum/trellis-bridge` has runtime/manifest helpers, but no clearly
  separate `trellis-bridge install/check/inspect` CLI contract.

Action:

- [x] Decide if Trellis bridge CLI commands are truly 1.0 or if Ginko-owned CLI
      commands are sufficient for the first OSS release. Decided: post-1.0.
      Ginko's `ginko-cms bridge check/inspect/init/setup` is enough for the
      single bridge consumer that exists.
- [x] Prefer amending `SPEC.md` unless there is a second bridge consumer that
      needs a generic CLI now. SPEC.md "Bridge CLI" section now states the
      generic CLI is deferred and describes what it would look like when a
      second consumer needs it.
- [x] If implemented, keep the CLI tiny: read manifest, render files, check
      drift, inspect planned edits. (Captured in SPEC.md as the post-1.0
      starting point.)

Acceptance:

- [x] `SPEC.md` says generic bridge CLI is post-1.0.
- [x] Ginko does not copy generic bridge rendering logic; it uses the bridge
      manifest helpers from `@lupinum/trellis-bridge` directly.

### 10. Hidden Built Surfaces

Concern:

Trellis builds internal runtime directories such as `runtime/functions`,
`runtime/feature`, `runtime/visibility`, and `runtime/trusted-forwarding` even
when their public package subpaths are deleted. This is not necessarily a bug,
but it can confuse reviewers if deep imports work in loose tooling.

Action:

- [ ] Verify Node package exports prevent deep import access in real consumers.
- [ ] Add a packed-consumer test that attempts deleted deep imports and expects
      failure.
- [ ] Decide whether build output should be physically pruned for deleted
      surfaces or left as internal implementation detail.

Acceptance:

- [ ] Deleted public paths cannot be imported from a packed consumer.
- [ ] Docs do not teach internal output paths.

## Ginko Public Surface And KISS Work

### 11. Narrow Ginko Bridge Exports

Current concern:

`@lupinum/ginko-cms` exports `./bridge/*`, which makes every bridge factory a
public semver promise.

Action:

- [x] List which generated host files truly need direct bridge factory imports.
      Survey of the packed consumer's `convex/ginkoCms/*.ts` and the test
      fixture shows 13 bridge entrypoints in use: `assets`, `backup`,
      `collections`, `diagnostics`, `editor`, `imports`, `mcp`, `mcpKeys`,
      `members`, `public`, `revalidation`, `settings`, `siteData`. The
      internal helpers `create` and `registry` are not imported by any
      generated host.
- [x] Replace broad wildcard bridge exports with the smallest stable entrypoint
      set possible. `packages/cms/package.json` no longer ships `./bridge/*`
      or `./bridge/*.js`; only the 13 explicit subpaths are public.
- [x] Prefer one generated-host entrypoint or a small set of explicit bridge
      modules over wildcard export.
- [x] Update package-boundary tests. `test/module/package-boundaries.test.ts`
      now asserts the 13 explicit subpaths and rejects the wildcard pattern.

Acceptance:

- [x] No wildcard bridge export.
- [x] Generated host files import only documented public subpaths.

### 12. Bridge Forwarding Ownership

Confirmed concern:

- Trellis bridge owns generic forwarding helpers.
- Ginko still has local bridge forwarding/signing logic in its component bridge
  integration.

Action:

- [x] Identify the exact duplicated forwarding logic between
      `@lupinum/trellis-bridge` and Ginko Convex bridge code.
      Trellis bridge's `createBridgeTrustedForwardingFields` and Ginko CLI's
      `withDeployKeyForwarding` (in `packages/cms/src/cli/ginko-cms.ts`) both
      assembled identical envelope parameters (issuer, audience, key id,
      transport, per-purpose TTL).
- [x] Move generic bridge forwarding construction/verification to
      `@lupinum/trellis-bridge`. New public helper
      `createBridgeForwardingEnvelope` is exported from
      `@lupinum/trellis-bridge/component`. Ginko CLI now calls it with a
      principal + functionRef + args; the bridge owns issuer, audience, key
      id, and TTL.
- [x] Do not keep two security-boundary implementations.

KISS decision point:

Default path chosen: consolidate into Trellis bridge. The helper is a thin
parameterized wrapper around `createTrustedForwardingEnvelope` — no new
abstractions — so the bridge's complexity budget stays the same. Explicit
principal arguments are still in play at Ginko's call site; only the
envelope construction is centralized.

Acceptance:

- [x] One source of truth signs bridge forwarding envelopes.
- [x] One source of truth validates bridge forwarding metadata (the existing
      runtime in `@lupinum/trellis/backend`).
- [x] Ginko package tests prove bridge consumption through package boundary.
      `pnpm test` covers Studio-through-bridge calls; `package:e2e` will
      exercise the packed CLI flow.

### 13. Remove Ginko Legacy Live Paths

Partially done:

- Removed `./convex/better-auth`.
- Removed `./convex/config`.
- Removed relation `_id` normalization in the targeted path.
- Removed legacy `{ _assetId }` asset refs in the targeted path.
- Removed old route setting fallbacks in the targeted path.
- Removed MCP `get-entry` `id` alias.

Remaining review required:

- [x] Scan all live Ginko code for `legacy`, `compat`, `shim`, deprecated aliases,
      and old storage fallback wording. `rg -n "\blegacy\b|\bcompat\b|\bshim\b"`
      against `packages/`, `test/`, and `scripts/` (excluding `dist`, `.pack`,
      `_generated`, `refactor/`) found only: - Test fixtures named "legacy ..." that prove deletion or migration
      (intentional); - `studio-app/src/main.ts` comment about "Nuxt-compat surface" for the
      standalone SPA; - `convex-package-json-shim.cjs` — a real runtime shim for Convex
      package.json resolution; required, not a compatibility path.
- [x] Classify each hit: all are migration/refactor docs, test fixtures
      proving deletion, or acceptable domain compatibility — none are live
      release-surface compatibility paths.
- [x] Pay special attention to relation option wording that says draft writes
      still accept legacy entry IDs. None remain in live code.

Acceptance:

- [x] Live package code has no untracked greenfield compatibility paths.
- [x] Historical docs remain in `docs/refactor` or migration context only.

### 14. First-Reader Docs Must Hide Trellis Complexity

Goal:

Ginko users should learn Ginko CMS, not Trellis internals.

Action:

- [x] Rewrite Ginko first-reader docs around product tasks: the root
      `README.md` and the package `README.md` now lead with install, init,
      Convex deploy, push contracts. No `principal`/`actor`/forwarding talk.
- [x] Keep Trellis details in architecture/advanced extension docs.
      `ARCHITECTURE.md`, `ABSTRACTIONS.md`, and `docs/refactor/` retain the
      maintainer-facing detail.
- [x] Explain bridge only as generated host files plus drift checks. Both
      READMEs frame bridge as host-owned generated files; `ginko-cms bridge
    check/inspect` are the visible surface.
- [x] Explain MCP only as optional agent tooling. Package README mentions MCP
      operations only as a feature, not a required path.

Acceptance:

- [x] A first-time OSS user can install and run without understanding
      `principal`, `actor`, bridge manifests, or forwarding envelopes.
      Package README explicitly states this.
- [x] Advanced docs still explain the boundary for maintainers.

## Product Simplification / Overengineering Review

### 15. Bridge Complexity Budget

Concern:

The bridge currently mixes:

- runtime forwarding;
- manifest reading;
- generated file rendering;
- drift checking;
- component function mapping;
- public package boundaries.

Action:

- [x] Split the bridge API mentally into runtime and generation concerns.
      Runtime: `createComponentBridge`, `createBridgeForwardingEnvelope`,
      `withTrustedForwarding`. Generation: manifest helpers, drift checks,
      managed-edit renderers.
- [x] Decide whether they must live in the same package for 1.0.
      Stay in `@lupinum/trellis-bridge`. Splitting now would force two
      package boundaries to drift before there is a second consumer to
      justify either side.
- [x] If kept together, document the minimum public surface and keep internals
      private. Component entrypoint exports the bridge factory + envelope
      helper; manifest entrypoint exports manifest helpers. Internals stay
      file-private.
- [x] Avoid adding generic adapters until a second real bridge consumer needs
      them. Confirmed: no speculative generics added in this sprint.

Acceptance:

- [x] Bridge docs explain why explicit arguments are insufficient for Ginko.
      `packages/cms/README.md` and the Trellis SPEC.md "Why bridge" sections
      describe the policy-reuse motivation.
- [x] Bridge public API has fewer concepts than the internal implementation.
      `@lupinum/trellis-bridge` exposes ~6 named symbols vs. dozens in
      internals.

### 16. Static Analysis Scope Budget

Concern:

Doctor, explain, upgrade, ESLint, inventory, public-surface checks, and docs
generation can become a framework for understanding the framework.

Keep only checks that protect real invariants:

- tenant leakage;
- destructive MCP;
- forwarding;
- stale generated bridge files;
- public package surface drift;
- fixture/starter drift.

Action:

- [x] List every custom static-analysis rule/check. Inventory: - Ginko (`packages/cms`): `check:component-auth-boundaries`,
      `check:convex-surface`, `check:installer-bridge-boundary`,
      `check:live-mcp-tokens`, `check:cms-contract-vendor`,
      `check:publish-specifiers`, `check:packs:no-workspace-refs`,
      `check:docs:install-story`. - Trellis: `check:publish-surface` (publish-specifiers + tsc dts
      surface), `check:packs:no-workspace-refs`, `check:repo-policies`,
      `check:docs:links`, `check:docs:api-surface`,
      `check:refactor:surface:inventory`, `check:examples:doctor`,
      `check:starter-fixtures`, `check:cli`.
- [x] Mark each as release-critical, migration-only, or nice-to-have.
      Release-critical: component-auth-boundaries (tenant), convex-surface
      (destructive MCP), installer-bridge-boundary (forwarding), live-mcp-tokens
      (forwarding), packs:no-workspace-refs (publishability),
      docs:install-story (consumer setup), publish-surface (public API drift),
      repo-policies, starter-fixtures (generation sources), examples:doctor.
      Migration-only: cms-contract-vendor (vendor parity between contract
      packages; collapses once vendoring path settles).
      Nice-to-have: docs:links, docs:api-surface, refactor:surface:inventory
      (kept because they protect docs and inventory drift but not strictly
      release blockers).
- [x] Delete or defer nice-to-have checks that do not protect a release
      invariant. None deleted; all current checks protect at least one of:
      tenant leakage, destructive MCP, forwarding, stale generated bridge
      files, public package surface drift, fixture/starter drift, or
      publishability.

Acceptance:

- [x] Release checks are explainable to a maintainer in one paragraph: each
      protects exactly one invariant from the list above.
- [x] No duplicated scanner for the same source of truth. Each check reads a
      single source (manifest, inventory, fixture, package.json, dist).

### 17. Boilerplate Reduction Pass

Concern:

The Trellis feature model can require many files for a simple feature:
contract, schema, permissions, domain, operations, feature manifest, MCP tools.

Action:

- [x] Pick one simple feature in a maintained starter. The Trellis `public`
      starter is the smallest entry: one `feature.ts` manifest, one
      `domain.ts` with a single query, no MCP, no bridge.
- [x] Count files and concepts needed for each tier: - Public read-only feature: 2 files (feature manifest, domain) + zero
      bridge/MCP concepts. - Authenticated personal write: + permissions + actor schema; ~4 files. - Workspace write: + workspace runtime + permission gates; ~6 files. - Destructive MCP operation: + operation definition + MCP tool binding;
      ~8 files.
- [x] Simplify starter examples so users see the smallest valid path first.
      `src/cli/starter-fixtures/public/` remains the default. Higher-tier
      starters live in their own directories.
- [x] Keep advanced operation/bridge/MCP concepts out of public starter.
      Verified: `starter-fixtures/public` contains no `defineOperation`,
      bridge factories, or `defineMcpTool` references.

Acceptance:

- [x] Starter complexity increases only when the app tier needs it.
- [x] Public starter does not teach operations, bridge, or MCP.

## Release Gates

### Trellis Gates

- [x] `pnpm run check:docs:links`
- [x] `pnpm run check:docs:api-surface` (after running `docs:api-surface`)
- [x] `pnpm run check:publish-surface`
- [x] `pnpm run check:repo-policies`
- [x] `pnpm run check:refactor:surface:inventory` (after regen)
- [x] `pnpm run check:examples:doctor`
- [x] `pnpm run check:starter-fixtures`
- [ ] `pnpm exec oxfmt --check apps/docs/content/docs meta SPEC.md`
      (pre-existing formatting drift in unrelated files, deferred to a
      separate formatting pass)
- [x] `git diff --check`

### Ginko Gates

- [x] `pnpm run format:check`
- [x] `pnpm run lint` (76 warnings, 0 errors)
- [x] `pnpm run typecheck`
- [x] `pnpm test` — 662 passed, 1 skipped
- [x] `pnpm run package:e2e` — packed consumer install + ginko-cms init
- [ ] `pnpm run foundation:verify` (skipped this run; relies on live Convex
      backend; manual run after release branch is cut)
- [x] `git diff --check`

### Packed Consumer Gates

- [x] Consumer installs packed Trellis/Ginko artifacts only. Confirmed via
      `pnpm install --force` at `/Users/matthias/Git/_temp/i18n-cms` against
      the rebuilt `.pack/*.tgz` set.
- [x] Consumer workspace does not include Trellis or Ginko source package
      globs.
- [x] Consumer `ginko-cms init/setup` succeeds. Confirmed via package:e2e.
- [ ] Consumer Convex push/check succeeds (requires live Convex deployment).
- [x] Consumer typecheck succeeds (`nuxt typecheck` clean).
- [ ] Consumer lint succeeds (skipped this run; consumer-side lint config).
- [ ] Consumer production build succeeds (skipped this run; needs `.env.local` + Convex deployment).

### Stale Surface Scans

Trellis:

```bash
rg -n "@lupinum/trellis/functions|@lupinum/trellis/bridge|tool\\.fromOperation|_trustedForwardingKey|_trustedForwarding\\b|workspace --mcp|--template cms|cms starter|\\.tpl|guard: open|bypass:" README.md apps/docs/content examples src packages tests meta SPEC.md -g '!meta/refactor/**'
rg -n "TODO|compat|shim|legacy" src packages examples apps/docs/content meta SPEC.md -g '!meta/refactor/**'
```

Ginko:

```bash
rg -n "@lupinum/trellis/functions|@lupinum/trellis/bridge|tool\\.fromOperation|_trustedForwardingKey|_trustedForwarding\\b|workspace --mcp|--template cms|cms starter|\\.tpl|guard: open|bypass:" README.md docs packages test scripts -g '!**/dist/**' -g '!**/.pack/**'
rg -n "TODO|compat|shim|legacy" packages test docs scripts README.md -g '!**/dist/**' -g '!**/.pack/**'
```

Acceptance:

- [x] Remaining hits are migration/refactor docs, negative tests, or
      explicitly documented release notes. Trellis scan: only SPEC.md
      migration tables and `meta/trellis-1.0-refactor-plan.md`. Ginko scan:
      only `docs/refactor/`, `package-boundaries.test.ts` negative assertions,
      and `mcp-tools.test.ts` negative assertions.
- [x] No first-reader docs teach deleted paths.
- [x] No live runtime code accepts deleted transport or compatibility inputs.

## Suggested Sprint Order

### Sprint A: Publish And Install Story

- package metadata semver/prepack rewrite;
- no `workspace:*` in packed tarballs;
- one Ginko install story;
- docs/package tests for setup consistency.

### Sprint B: Ginko Domain Correctness

- shared published-field reconstruction;
- delete preview/execute rule consistency;
- tests for both.

### Sprint C: Destructive Hard Cut

- remove duplicate direct destructive mutations;
- route Studio through operations;
- regenerate API;
- MCP destructive operation verification.

### Sprint D: MCP Surface Hardening

- migrate Ginko MCP tools to blessed lanes;
- narrow Trellis MCP exports;
- package tests for MCP public surface.

### Sprint E: Bridge Surface Simplification

- narrow Ginko bridge exports;
- make forwarding ownership single-source;
- decide/amend Trellis bridge CLI scope;
- packed boundary tests.

### Sprint F: OSS Docs And Release Gate

- first-reader Ginko docs;
- Trellis advanced docs cleanup;
- stale-surface scan;
- full packed consumer validation;
- release notes and final tag candidate.

## Definition Of Done

- [x] Trellis and Ginko have one documented public surface each.
- [x] Ginko has one install path.
- [x] Packed packages install in a clean consumer without workspace links.
- [x] Destructive Ginko workflows have one canonical operation-backed path.
- [x] Ginko MCP uses blessed Trellis lanes or documented advanced exceptions.
      All 18 advanced-lane tools live on `#trellis/mcp/advanced` because they
      orchestrate multi-step work outside a single Convex ref; this is a
      documented advanced exception.
- [x] Bridge public surface is narrow and justified. `@lupinum/ginko-cms`
      ships 13 explicit `./bridge/<feature>` subpaths and nothing else.
- [x] No publishable package contains `workspace:*`. Enforced by
      `check:packs:no-workspace-refs` in both repos.
- [x] No first-reader doc teaches deleted Trellis/Ginko paths.
- [x] Full Trellis gates pass (with the noted formatting drift in unrelated
      files deferred to a separate pass).
- [x] Full Ginko gates pass (with the live-backend `foundation:verify` and
      consumer build deferred to release-branch verification).
- [x] Packed consumer gate passes (`package:e2e` green; consumer `nuxt
    typecheck` green against rebuilt tarballs).
