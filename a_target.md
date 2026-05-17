# Trellis A+ Deslop Target

Status: active refactor target  
Created: 2026-05-17  
Scope: Trellis runtime, MCP, bridge, project analysis, tests, and docs

This document is the refactor target after the deslop review. It is intentionally
direct: the goal is not to make Trellis look more mature. The goal is to make it
smaller, more honest, easier to audit, and harder to misuse.

Default rule for every phase:

```txt
delete > simplify > replace > add
```

Before adding a layer, option, table, helper, test, export, policy script, bridge
surface, or compatibility path, answer:

- Can the old thing be deleted instead?
- Can the existing path be made direct?
- Is this a real product requirement or future-proofing?
- What invariant proves this must exist?
- What source of truth owns it?

## Target Shape

```txt
Nuxt / server / MCP host surfaces
  -> small Trellis public package surfaces
    -> protected backend runtime
      -> caller / actingFor / appIdentity resolution
      -> guard / load / authorize / handler
      -> explicit tenant isolation db wrapper
      -> explicit destructive confirmation wrapper
        -> Convex data model and app-owned domain logic
```

MCP is a transport projection over backend-owned policy. It must not become a
second authorization or destructive-safety runtime.

Feature manifests may describe app inventory, but only if they feed one runtime
source of truth. If they only document the app shape, call them inventory and do
not present them as enforcement.

## Long-Lived Concepts

- Protected handler pipeline: `caller -> appIdentity -> guard -> load -> authorize -> handler`.
- Backend-owned authorization. UI, MCP, and server projections may preflight, but
  they do not own the final permission decision.
- One tenant isolation model with explicit actor tenant resolution and table
  classification.
- One destructive confirmation policy with one token shape, one replay story, and
  one drift check implementation.
- Operation descriptors as product-facing business metadata, not sideband theater.
- Identity forwarding as a verified trust boundary, not public args.
- MCP direct writes only when backend-owned metadata proves bounded write safety.
- Docs generated from implementation where possible; stale meta docs deleted.
- Tests focused on invariants and public behavior, not file-shape nostalgia.

## Non-Goals

- Do not add compatibility layers for old names.
- Do not add feature flags for refactors in unreleased or greenfield surfaces.
- Do not keep old and new runtime paths side by side.
- Do not add more regex architecture checks.
- Do not add new public package exports just to make internal code easier to reach.
- Do not preserve stale docs as "historical context" unless they are clearly
  marked archival and excluded from product guidance.

## Verified Baseline

These findings were double-checked by local inspection and subagent audits.

- `src/runtime/functions/index.ts` is 3024 lines and centralizes runtime options,
  isolation, service rules, DB decoration, identity forwarding, destructive
  confirmation, builder lanes, and exports.
- `isolation.sharedTables` is validated, composed, and analyzed, but runtime
  isolation rules are built from `isolation.tables` only.
- The table-side tenant field is configurable with `isolation.field`, but the
  actor-side tenant key is `appIdentity.workspaceId`.
- `ctx.db.escapeIsolation({ reason })` is a broad cross-tenant DB bypass with
  observation, not a narrow permit.
- Backend and MCP both perform destructive confirmation checks in backend mode.
- Direct MCP write safety can be locally stamped near the tool definition.
- Project analysis and repo boundary checks rely heavily on regex/string scanning.
- Several tests hardcode the local repository path.
- `packages/trellis-bridge` contains pass-through helpers and repeated lanes.
- Some meta docs and `SPEC.md` describe old names or nonexistent APIs.

## Global Verification Commands

Run these before declaring the full A+ target complete:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm run release:verify
node scripts/check-repo-policies.mjs
```

Run targeted tests while working through phases:

```bash
pnpm vitest run --project=unit tests/unit/functions-defineHandler.test.ts
pnpm vitest run --project=unit tests/unit/functions-isolation.test.ts
pnpm vitest run --project=unit tests/unit/functions-defineTrellis.test.ts
pnpm vitest run --project=unit tests/unit/identity-forwarding.test.ts
pnpm vitest run --project=unit tests/unit/identity-forwarding-envelope.test.ts
pnpm vitest run --project=unit tests/unit/mcp-operation-binding.test.ts
pnpm vitest run --project=unit tests/unit/define-convex-tool.test.ts
pnpm vitest run --project=unit tests/unit/feature-compose.test.ts
pnpm vitest run --project=unit tests/unit/tenant-analysis-validation.test.ts
pnpm vitest run --project=unit tests/unit/package-subpath-exports.test.ts
```

## 1. Phase A+0 - North-Star Baseline

Purpose: create one durable target so future refactors optimize for deletion,
honest names, and real invariants.

Target shape:

```txt
host transport
  -> Trellis public surface
    -> backend-owned policy runtime
      -> domain operation / handler
        -> Convex data model
```

Tasks:

- [x] Create this A+ target document.
- [x] Record the verified slop findings without relying on unverified claims.
- [x] Preserve the rule that new structure must delete or simplify something.
- [x] Preserve the rule that MCP is a projection, not the business policy owner.
- [x] Preserve the rule that backend authorization remains the final decision.
- [ ] Link this document from `README.md` once the first refactor PR lands.
- [ ] Link this document from relevant maintainer docs after stale meta docs are
      cleaned.

Acceptance:

- [x] The target architecture is stated without implying "framework everywhere".
- [x] The plan uses phase sections with tasks, acceptance, verification, and
      progress.
- [x] Future implementation PRs can point to this file for exit criteria.
- [ ] The root README points maintainers to this active refactor target.

Verification:

- [x] Local inspection confirmed `a_target.md` did not exist before creation.
- [ ] `pnpm lint`
- [ ] `pnpm typecheck`

Progress:

- [x] 2026-05-17: Created `a_target.md` as the active deslop refactor target.

## 2. Phase A+1 - Delete Stale Docs And Refactor Scars

Purpose: remove misleading guidance before junior engineers follow old APIs.

Files to inspect first:

- `meta/DEVELOPMENT.md`
- `meta/skill/references/backend-auth-permissions.md`
- `SPEC.md`
- `apps/docs/content/docs/13.api-reference/8.type-primitives.md`
- `tests/unit/future-agent-conventions.test.ts`
- `tests/unit/schema-boundary-policy.test.ts`
- `tests/unit/examples-gallery-docs.test.ts`

Tasks:

- [ ] Replace `CONVEX_TRUSTED_FORWARDING_KEY` with the current
      `CONVEX_IDENTITY_FORWARDING_KEY`, or delete the stale section if it is no
      longer product guidance.
- [ ] Delete or rewrite references to nonexistent
      `src/runtime/trusted-forwarding/*`.
- [ ] Replace old option names such as `principal`, `delegation`, `actor`,
      `tenantIsolation`, and `destructiveSafety` with current names only where
      the doc is still meant to be current.
- [ ] Delete stale bridge references to `defineBridgeManifest` if
      `defineComponentBridgeManifest` is the only current API.
- [ ] Update TypeScript compatibility docs to match `compatibility.json`.
- [ ] Replace hardcoded `/Users/matthias/Git/0_libs/WORK/trellis` test roots
      with `process.cwd()` or a repo-root helper.
- [ ] Delete phrase-locking tests that only preserve old refactor vocabulary.
- [ ] Keep only doc tests that protect current user-facing promises.

Acceptance:

- [ ] No current docs point to nonexistent runtime files.
- [ ] No current docs use old option names as active guidance.
- [ ] No unit test contains an absolute local path.
- [ ] Stale docs are either deleted, corrected, or clearly marked archival.
- [ ] The public API docs and package exports agree.

Verification:

- [ ] `rg -n "CONVEX_TRUSTED_FORWARDING_KEY|trusted-forwarding|defineBridgeManifest|tenantIsolation|destructiveSafety|escapeTenantIsolation" meta SPEC.md apps/docs README.md`
- [ ] `rg -n "/Users/matthias/Git/0_libs/WORK/trellis" tests src apps examples`
- [ ] `pnpm vitest run --project=unit tests/unit/package-subpath-exports.test.ts`
- [ ] `node scripts/check-repo-policies.mjs`

Progress:

- [ ] Add dated progress entries here.

## 3. Phase A+2 - Make Tenant Isolation Honest

Purpose: make isolation one explicit runtime model instead of a mix of docs,
manifest classification, static analysis, and `workspaceId` convention.

Current problem:

- `sharedTables` is validated but not enforced at runtime.
- `isolation.field` configures document field lookup.
- Actor tenant lookup still assumes `appIdentity.workspaceId`.
- `escapeIsolation` is broad and only requires a reason.

Target shape:

```txt
defineTrellis({
  isolation: {
    tables,
    sharedTables,
    field,
    actorScope,
  }
})
  -> one rule builder
  -> one test suite proving read/write/insert/delete isolation
```

Tasks:

- [ ] Decide whether `sharedTables` is runtime policy or inventory only.
- [ ] If `sharedTables` is inventory only, rename or move it so docs do not
      imply runtime enforcement.
- [ ] If `sharedTables` is runtime policy, make the rule builder explicitly
      handle shared/global tables.
- [ ] Add an explicit actor tenant resolver, for example `actorScope`, instead
      of hard-coding `appIdentity.workspaceId`.
- [ ] Keep the default resolver compatible with current examples only if it does
      not create a second source of truth.
- [ ] Add runtime tests proving wrong-workspace reads fail.
- [ ] Add runtime tests proving wrong-workspace writes fail.
- [ ] Add runtime tests proving wrong-workspace inserts fail.
- [ ] Add runtime tests proving shared/global tables behave as documented.
- [ ] Replace `escapeIsolation({ reason })` with a typed permit or explicit
      operation/service allowlist, or document and test why reason-only is enough.
- [ ] Ensure service principals and cross-tenant operator flows still have a
      narrow, auditable path.

Acceptance:

- [ ] There is exactly one runtime source of truth for tenant tables.
- [ ] There is exactly one runtime source of truth for shared/global tables.
- [ ] Actor tenant lookup is explicit and documented.
- [ ] `escapeIsolation` cannot be used casually without a narrow, reviewable
      reason or permit.
- [ ] Tests fail if a tenant-scoped table is accessed through the wrong actor
      scope.
- [ ] Tests fail if docs claim shared-table behavior that runtime does not
      implement.

Verification:

- [ ] `pnpm vitest run --project=unit tests/unit/functions-isolation.test.ts`
- [ ] `pnpm vitest run --project=unit tests/unit/functions-defineTrellis.test.ts`
- [ ] `pnpm vitest run --project=unit tests/unit/feature-compose.test.ts`
- [ ] Run example isolation tests under `examples/04-saas-platform`,
      `examples/05-visibility-access`, and `examples/06-multi-workspace`.
- [ ] `rg -n "workspaceId" src/runtime/functions examples apps src/cli/starter-fixtures`
- [ ] `rg -n "escapeIsolation" src examples apps tests`

Progress:

- [ ] Add dated progress entries here.

## 4. Phase A+3 - Split The Backend Runtime Blob

Purpose: make the backend runtime auditable without changing public behavior.

Current problem:

`src/runtime/functions/index.ts` owns too much. It should be a barrel and a thin
composition point, not the implementation home for every invariant.

Target modules:

```txt
src/runtime/functions/
  index.ts                 public exports and defineTrellis composition
  runtime-options.ts       option types and validation
  runtime-context.ts       caller / actingFor / appIdentity wiring
  isolation-runtime.ts     isolation rule builder and db decoration
  service-runtime.ts       service principal rule builder
  destructive-runtime.ts   backend destructive confirmation wrapper
  lanes.ts                 public / protected / unsafe lane assembly
```

Tasks:

- [ ] Move option validation out of `index.ts`.
- [ ] Move isolation rule construction out of `index.ts`.
- [ ] Move service principal rule construction out of `index.ts`.
- [ ] Move DB decoration out of `index.ts`.
- [ ] Move destructive operation wrapping out of `index.ts`.
- [ ] Move lane assembly out of `index.ts`.
- [ ] Keep `defineTrellis` public API stable unless a rename is part of an
      explicit phase.
- [ ] Avoid adding wrapper classes, registries, or generic service containers.
- [ ] Delete duplicate helper types after extraction.
- [ ] Keep the extracted modules small enough that one invariant can be reviewed
      in one file.

Acceptance:

- [ ] `src/runtime/functions/index.ts` is mostly exports and composition.
- [ ] Each extracted module owns one clear invariant.
- [ ] No new public exports are added only to support extraction.
- [ ] No compatibility path keeps both old and new internal implementations.
- [ ] Existing behavior tests still pass.

Verification:

- [ ] `wc -l src/runtime/functions/index.ts`
- [ ] `pnpm vitest run --project=unit tests/unit/functions-defineHandler.test.ts`
- [ ] `pnpm vitest run --project=unit tests/unit/functions-defineTrellis.test.ts`
- [ ] `pnpm vitest run --project=unit tests/unit/functions-isolation.test.ts`
- [ ] `pnpm typecheck`

Progress:

- [ ] Add dated progress entries here.

## 5. Phase A+4 - Collapse Destructive Confirmation To One Policy

Purpose: remove duplicated destructive confirmation logic while preserving the
backend as the final safety boundary.

Current problem:

In backend confirmation mode, MCP verifies token, reruns preview, checks drift,
then backend verifies token, reloads, reauthorizes, reruns preview, checks drift,
redeems, and audits. Some preflight is useful UX. Duplicating the safety engine
is not.

Target shape:

```txt
destructive-confirmation-policy.ts
  -> sign preview token
  -> verify token binding
  -> validate preview state
  -> classify replay / drift / blocked errors

backend destructive runtime
  -> owns final redemption and audit

MCP transport
  -> preview UX
  -> optional transport-mode replay store
  -> delegates backend-mode final safety to backend
```

Tasks:

- [ ] Identify the minimum MCP checks needed before backend execution.
- [ ] Move shared token binding, hash, drift, and error classification into one
      policy module.
- [ ] Remove duplicated preview-state validation code from MCP or backend.
- [ ] Keep backend-mode final redemption in backend runtime.
- [ ] Keep transport-mode replay protection only where MCP truly owns transport
      confirmation.
- [ ] Add tests proving backend-mode destructive execution is safe if MCP
      preflight is skipped.
- [ ] Add tests proving MCP transport-mode still requires a distributed store in
      production.
- [ ] Add tests proving stale preview, changed args, changed version, blocked
      preview, and replay are classified consistently.

Acceptance:

- [ ] There is one token binding shape.
- [ ] There is one drift classification implementation.
- [ ] Backend-mode MCP does not duplicate final safety checks.
- [ ] Backend remains the final destructive safety boundary.
- [ ] Transport-mode behavior remains explicit and tested.

Verification:

- [ ] `pnpm vitest run --project=unit tests/unit/functions-defineTrellis.test.ts`
- [ ] `pnpm vitest run --project=unit tests/unit/define-convex-tool.test.ts`
- [ ] `pnpm vitest run --project=unit tests/unit/mcp-operation-binding.test.ts`
- [ ] `rg -n "operation.confirm|previewHash|argsHash|confirmationToken|validateDestructivePreviewState" src/runtime`

Progress:

- [ ] Add dated progress entries here.

## 6. Phase A+5 - Move MCP Write Safety Proof To Backend-Owned Metadata

Purpose: stop direct MCP mutation tools from self-certifying bounded-write
safety near the tool file.

Current problem:

`assertDirectToolSafety` requires safety metadata on both the tool declaration
and backend ref, but examples stamp the generated ref beside the tool. That
proves the tool author wrote matching labels, not that the backend operation was
designed as bounded write.

Target shape:

```txt
backend function / operation descriptor
  -> owns write safety metadata
    -> generated or projected ref carries safety
      -> MCP direct tool may consume it
```

Tasks:

- [ ] Find every use of `stampMcpToolSafety`.
- [ ] Move safety declaration to backend operation definition or descriptor.
- [ ] Make MCP direct tools read backend-owned metadata instead of stamping it.
- [ ] Delete local self-stamping from `examples/07-mcp-reference`.
- [ ] For tools that cannot prove bounded write from backend metadata, convert
      them to `tool.operation(...)` or remove them.
- [ ] Rename local metadata types to `Declared...` only if self-declaration must
      remain for a narrow reason.
- [ ] Add tests that fail when a mutation tool declares `safety` without
      backend-owned safety metadata.
- [ ] Add tests that fail when a local tool stamps safety on a generated ref.

Acceptance:

- [ ] Direct MCP mutations cannot self-certify safety in the tool file.
- [ ] Backend-owned metadata is the only proof source for bounded-write direct
      tools.
- [ ] Destructive and sensitive writes must use operation-backed preview or an
      explicitly reviewed backend metadata path.
- [ ] Example tools demonstrate the intended pattern.

Verification:

- [ ] `rg -n "stampMcpToolSafety|safety:" src examples tests`
- [ ] `pnpm vitest run --project=unit tests/unit/define-convex-tool.test.ts`
- [ ] `pnpm vitest run --project=unit tests/unit/mcp-operation-binding.test.ts`
- [ ] Run `examples/07-mcp-reference` MCP tests.

Progress:

- [ ] Add dated progress entries here.

## 7. Phase A+6 - Replace Or Demote Regex Project Analysis

Purpose: stop presenting regex text scans as architecture validation.

Current problem:

`src/analysis/project.ts` parses tables, indexes, isolation config, destructive
safety, and feature manifests using regex and string matching. This is fine for
best-effort hints, not for strong doctor claims.

Decision:

Choose exactly one path.

Path A - Honest best-effort doctor:

- [ ] Rename output language from proof/fail wording to best-effort guidance.
- [ ] Downgrade diagnostics that rely on regex-only inference.
- [ ] Keep the analyzer small.
- [ ] Add comments that describe known parser limits.

Path B - Real parser:

- [ ] Replace regex parsing with AST parsing.
- [ ] Use one parser path for functions, schema, feature manifests, and imports.
- [ ] Prove computed arrays and imports are handled or explicitly unsupported.
- [ ] Delete regex parsing once the AST path passes tests.

Tasks:

- [ ] Decide Path A or Path B before editing.
- [ ] Remove duplicate parsing logic that overlaps with feature manifests.
- [ ] Ensure doctor output says whether a finding is proven or inferred.
- [ ] Add fixtures for computed arrays, imported arrays, nested objects, multiline
      imports, and comments.
- [ ] Delete tests that only prove regex syntax.

Acceptance:

- [ ] Doctor never claims a guarantee it cannot prove.
- [ ] Regex scanners are either deleted or clearly best-effort.
- [ ] Tests cover realistic project files, not only synthetic one-line snippets.
- [ ] No new boundary policy is implemented with ad hoc regex if an existing
      parser or lint rule can do the job.

Verification:

- [ ] `pnpm vitest run --project=unit tests/unit/tenant-analysis-validation.test.ts`
- [ ] `pnpm vitest run --project=unit tests/unit/cli-doctor.test.ts`
- [ ] `pnpm vitest run --project=unit tests/unit/repo-policies.test.ts`
- [ ] `node scripts/check-repo-policies.mjs`

Progress:

- [ ] Add dated progress entries here.

## 8. Phase A+7 - Simplify Component Bridge

Purpose: keep the bridge only if it is an honest integration boundary, not a
symmetrical abstraction showcase.

Current problem:

`packages/trellis-bridge/src/create-component-bridge.ts` repeats public/internal
query/mutation/action lanes, exposes pass-through helpers, and accepts
`forwardingPurpose` in places where it is not honored.

Tasks:

- [ ] Delete `callComponentBridgeRegistrar`.
- [ ] Decide whether both `@lupinum/trellis-bridge/component` and
      `@lupinum/trellis-bridge/convex` must exist.
- [ ] If both subpaths are not required, hard-cut to one public bridge import.
- [ ] Make `forwardingPurpose` available only on lanes that honor it, or make
      all lanes honor it.
- [ ] Collapse duplicated public/internal registration logic into one explicit
      helper without creating a generic framework.
- [ ] Remove batch registration types if no real consumer needs them.
- [ ] Keep identity forwarding behavior visible and testable.
- [ ] Update bridge docs and `SPEC.md` to current names only.

Acceptance:

- [ ] No pass-through exported helper remains.
- [ ] No option is accepted on a type unless runtime behavior honors it.
- [ ] There is one recommended bridge import path in current docs.
- [ ] Bridge tests prove behavior, not just type surface.
- [ ] Advanced bridge examples still run or are explicitly marked non-canonical.

Verification:

- [ ] `pnpm --filter @lupinum/trellis-bridge test`
- [ ] `pnpm --filter @lupinum/trellis-bridge build`
- [ ] `rg -n "callComponentBridgeRegistrar|forwardingPurpose|defineBridgeManifest|trellis-bridge/convex|trellis-bridge/component" packages apps/docs examples SPEC.md tests`
- [ ] Run `examples/08-component-mini-cms` tests if present.

Progress:

- [ ] Add dated progress entries here.

## 9. Phase A+8 - Make Feature Manifests One Source Or Rename Them

Purpose: resolve whether feature manifests are runtime configuration, generated
inventory, or documentation.

Current problem:

Feature manifests do useful work: duplicate detection, operation inventory, and
tenant table derivation. But schema membership still appears separately in
`convex/schema.ts`, `recordAccess` is accepted by `defineFeature` and not carried
into `FeatureManifest`, and static analysis can infer a parallel model.

Target choices:

Option A - Manifest is source of truth:

```txt
feature definitions
  -> composeFeatures
    -> schema
    -> isolation tables
    -> operations
    -> recordAccess inventory
    -> defineTrellis input
```

Option B - Manifest is inventory only:

```txt
Convex schema / defineTrellis config
  -> runtime truth
feature inventory
  -> docs / doctor hints / examples only
```

Tasks:

- [ ] Choose Option A or Option B before editing.
- [ ] If Option A, generate or directly export schema and isolation from the
      manifest so `convex/schema.ts` does not repeat membership manually.
- [ ] If Option A, include `recordAccess` in the composed manifest or remove it
      from `defineFeature`.
- [ ] If Option B, rename `FeatureManifest` or docs to make clear it is inventory.
- [ ] Delete static analysis paths that create a third source of truth.
- [ ] Add tests for duplicate feature names, schema keys, permission keys, and
      operation ids.
- [ ] Add tests proving `sharedTables` and `tenantTables` feed the same runtime
      source chosen in Phase A+2.

Acceptance:

- [ ] A junior engineer can answer "where do I add a table?" with one location.
- [ ] A junior engineer can answer "where do I mark a table shared?" with one
      location.
- [ ] `recordAccess` is either composed or deleted.
- [ ] Manifest docs match actual runtime behavior.

Verification:

- [ ] `pnpm vitest run --project=unit tests/unit/feature-compose.test.ts`
- [ ] `pnpm vitest run --project=unit tests/unit/tenant-analysis-validation.test.ts`
- [ ] `rg -n "defineFeature|composeFeatures|recordAccess|tenantTables|sharedTables" src examples src/cli/starter-fixtures apps/docs`

Progress:

- [ ] Add dated progress entries here.

## 10. Phase A+9 - Rebalance Tests Toward Product Invariants

Purpose: keep useful tests and delete confidence theater.

Keep tests that prove:

- protected handler ordering and fail-closed behavior
- identity forwarding envelope validation
- auth and delegation boundaries
- tenant isolation behavior
- destructive confirmation drift/replay behavior
- MCP backend authorization drift handling
- public package export contract
- example app critical workflows

Delete or rewrite tests that mostly prove:

- exact doc phrases
- old migration vocabulary is gone
- file shape without runtime behavior
- one-line regex scanners
- local machine paths
- property presence on internal barrels when public export tests already cover it

Tasks:

- [ ] Inventory unit tests into `keep`, `rewrite`, and `delete` buckets.
- [ ] Delete tests with hardcoded absolute paths after replacing any useful
      assertion.
- [ ] Rewrite regex tests as realistic fixture tests or delete them.
- [ ] Keep package export tests only for public contract.
- [ ] Keep boundary tests only where they protect a real public rule.
- [ ] Add missing tenant isolation runtime tests from Phase A+2.
- [ ] Add missing destructive confirmation single-policy tests from Phase A+4.
- [ ] Add missing direct MCP safety proof tests from Phase A+5.

Acceptance:

- [ ] The test suite is smaller or more behavior-dense after this phase.
- [ ] No hardcoded local path remains.
- [ ] Every architecture/boundary test states the production invariant it
      protects.
- [ ] Tests that lock docs are generated from docs or public API, not handpicked
      phrase checks.

Verification:

- [ ] `rg -n "/Users/matthias|stable automation seam|kind: 'mcp'|shared/schemas" tests`
- [ ] `pnpm test`
- [ ] `pnpm vitest run --project=unit`

Progress:

- [ ] Add dated progress entries here.

## 11. Phase A+10 - Public API And Naming Honesty

Purpose: make names describe what the code actually guarantees.

Rename candidates:

- `runtime-enforced isolation` -> `tenant isolation guardrails` unless the runtime
  model proves full enforcement.
- Internal `unsafeQuery` / `unsafeMutation` builder variables -> `baseQuery` /
  `baseMutation` if they are not the public unsafe escape hatch.
- `FeatureManifest` -> `FeatureInventory` if it remains descriptive.
- `McpWriteSafety` or direct tool safety declarations -> `DeclaredMcpWriteSafety`
  if the value is not backend-owned proof.
- `operation projection metadata` -> `operation ref metadata` if the metadata is
  sideband tagging rather than a generated projection.

Tasks:

- [ ] Audit docs for names that imply stronger guarantees than implementation.
- [ ] Rename internal variables where names confuse maintainers.
- [ ] Avoid public renames unless the current name is actively misleading.
- [ ] If a public rename is required, hard-cut in unreleased surfaces.
- [ ] Do not add compatibility aliases unless explicitly required for published
      package compatibility.
- [ ] Update examples and docs in the same PR as any rename.

Acceptance:

- [ ] Names match actual guarantees.
- [ ] No new dual-name compatibility layer exists for unreleased surfaces.
- [ ] Public docs use the same vocabulary as implementation.
- [ ] Generated API docs and package exports agree.

Verification:

- [ ] `pnpm vitest run --project=unit tests/unit/package-subpath-exports.test.ts`
- [ ] `pnpm typecheck`
- [ ] `rg -n "runtime-enforced|unsafeQuery|unsafeMutation|FeatureManifest|McpWriteSafety|projection metadata" src apps/docs meta README.md`

Progress:

- [ ] Add dated progress entries here.

## 12. Phase A+11 - Final A+ Validation

Purpose: prove the codebase is smaller, more honest, and safer to change.

Final acceptance:

- [ ] `src/runtime/functions/index.ts` is no longer the home of every backend
      invariant.
- [ ] Tenant isolation has one source of truth and runtime tests.
- [ ] Shared/global table behavior is either enforced or honestly labeled as
      inventory.
- [ ] `escapeIsolation` is narrow, permitted, and tested.
- [ ] Backend and MCP do not duplicate destructive confirmation policy.
- [ ] MCP direct write safety is backend-owned.
- [ ] Regex analysis is either deleted or clearly best-effort.
- [ ] Bridge public API has no pass-through helpers or unhonored options.
- [ ] Stale meta docs and `SPEC.md` guidance are corrected or removed.
- [ ] No tests contain local absolute paths.
- [ ] Test suite confidence comes from invariants, not phrase and file-shape
      locks.
- [ ] Public package exports match public docs.
- [ ] The root README links to this active target while the refactor is ongoing.

Verification:

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm run release:verify`
- [ ] `node scripts/check-repo-policies.mjs`
- [ ] `git status --short`

Progress:

- [ ] Add dated progress entries here.

## Junior Engineer Rules Of Engagement

- Work one phase at a time.
- Prefer one small PR per phase or subphase.
- Do not start with a new abstraction.
- Do not keep old and new paths side by side unless this file explicitly says so.
- When a task says "decide", write the decision in the PR description before
  coding.
- When deleting tests, explain which invariant is already covered elsewhere or
  why the test was not protecting product behavior.
- When changing docs, remove stale guidance instead of adding warnings around it.
- When changing runtime policy, add invariant tests before or with the code.
- When a change touches MCP, prove backend authorization still owns the final
  decision.
- When a change touches destructive work, prove stale preview and replay still
  fail closed.

## Progress Log

- [x] 2026-05-17: Completed second-pass deslop verification with four focused
      audits covering runtime/isolation, MCP/destructive safety, test/tooling
      docs, and bridge/API surface.
- [x] 2026-05-17: Confirmed targeted runtime/isolation tests and MCP/destructive
      tests passed in subagent verification.
- [x] 2026-05-17: Created this A+ target as the active refactor plan.
