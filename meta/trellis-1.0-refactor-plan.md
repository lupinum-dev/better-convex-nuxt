# Trellis 1.0 Refactor Plan

Status: planning baseline
Owner: Matthias

This is the execution tracker for the hard-cut Trellis 1.0 refactor.

The premise is explicit: there are no current external users to preserve. Trellis
should ship 1.0 with the new shape cleanly, not with old and new systems kept
alive side by side.

Related planning docs:

- `meta/experiments/phase0-next-major.md`
- `meta/experiments/phase0-go-no-go.md`
- `meta/experiments/phase0-pre-alpha-decisions.md`
- `meta/rfc-forwarding-envelope.md`

## Refactor Rules

- [ ] No compatibility shim unless this plan names it.
- [ ] Old APIs are deleted once replacement tests pass.
- [ ] Every public export has one owner surface: core, functions/backend, args,
      composables, feature, auth, workspace, mcp, server, testing,
      trusted-forwarding, visibility, type-primitives, bridge, eslint, cli, or
      internal.
- [ ] Every old path is classified as delete, move, replace, or keep.
- [ ] Every important concept has one source of truth.
- [ ] Generated/derived data is clearly marked and rebuildable from canonical
      descriptors or manifests.
- [ ] Security-sensitive changes use hard cutovers, not hidden aliases.
- [ ] A slice is not done until old code is removed, tests pass, and docs teach
      only the new path.

## Global Done Means

- [ ] No public docs mention removed APIs as supported.
- [x] `tool.fromOperation(...)` is gone from public API and docs.
- [ ] Raw trusted-forwarding args are gone from production/default paths.
- [ ] Bridge APIs are gone from core package exports.
- [ ] Starter generation is fixture-backed for `public`, `personal`,
      `workspace`, and `workspace-mcp`.
- [ ] Public surface snapshots pass and every public diff has rationale.
- [ ] Full unit suite passes.
- [ ] Publish surface check passes.
- [ ] Docs API surface check passes.
- [ ] Forwarding benchmark remains tracked.
- [ ] Phase 0 external forwarding security review is resolved or accepted with
      documented follow-up.
- [ ] Ginko CMS passes the agreed cross-repo 1.0 validation gate against packed
      Trellis packages.

## Slice 1: Public Surface Inventory And Decisions

Status: complete for 1.0 planning baseline

Goal: decide exactly what survives into 1.0 before moving code.

### Inventory

- [x] List npm exports from `package.json`.
- [x] List runtime barrels under `src/runtime/**/index.ts`.
- [x] List Nuxt aliases and generated aliases.
- [x] List auto-imports and global components.
- [x] List CLI commands and subcommands.
- [x] List generated file contracts.
- [x] List bridge manifest contracts.
- [x] List docs snippets that teach import paths.
- [x] Classify every current npm subpath: root, `auth`, `args`,
      `composables`, `functions`, `bridge`, `feature`, `eslint`,
      `trusted-forwarding`, `visibility`, `mcp`, `type-primitives`, `server`,
      and `testing`.
- [x] Classify internal-looking barrels that could accidentally become public:
      `schema`, `observability`, and any generated/devtools runtime barrels.
- [x] Classify generated Nuxt contracts: `#trellis`, `#trellis/api`,
      `#trellis/server`, `#trellis/mcp`, permission imports, auth components,
      client composable auto-imports, and server imports.

### Decide

- [x] Decide `@lupinum/trellis/functions` versus
      `@lupinum/trellis/backend`: hard-cut to `@lupinum/trellis/backend`.
- [x] Decide public/protected/unsafe builder spelling: use
      `query.public`, `query.protected`, `mutation.public`,
      `mutation.protected`, and `mutation.unsafe`.
- [x] Decide final MCP lanes and public names: use `mcp.tool.query`,
      `mcp.tool.mutation`, and `mcp.tool.operation`.
- [x] Decide which bridge APIs move to `@lupinum/trellis-bridge`: all component
      bridge runtime, manifest, package-author, check/generate/inspect APIs, and
      bridge-owned CLI support.
- [x] Decide which observability delivery APIs remain public: core keeps event
      schema/capture; evlog delivery is not part of the default core runtime.
- [x] Decide whether `workspace --mcp` stays as a CLI alias for 1.0: delete the
      alias; `workspace-mcp` is canonical.
- [x] Decide whether `cms` remains a Trellis starter, is deleted, or becomes
      Ginko-owned setup only: Ginko owns CMS setup; Trellis removes the beginner
      `cms` starter.
- [x] Decide whether root `trellis bridge` remains, moves to bridge-owned CLI,
      or is deleted from the root CLI: move to bridge-owned tooling.
- [x] Decide whether `tsconfig.types.public.compat.json` and
      `test:types:public:compat` are deleted or renamed to a 1.0 meaning:
      delete or replace with explicit 1.0 public-surface/migration checks.
- [x] Decide `trellis add` ownership: keep it only as a fixture/inventory-backed
      feature command; delete old template-backed add slices.

### Delete / Replace / Keep Table

| Old Surface                                      | 1.0 Surface                         | Action                       | Proof                     |
| ------------------------------------------------ | ----------------------------------- | ---------------------------- | ------------------------- |
| `tool.fromOperation(...)`                        | `mcp.tool.operation(...)`           | delete                       | codemod/test              |
| raw `_trustedForwardingKey` args                 | `_trellisForwarding` envelope       | delete                       | forwarding tests          |
| core bridge exports                              | `@lupinum/trellis-bridge`           | move/delete                  | bridge tests              |
| bridge helpers from `@lupinum/trellis/functions` | `@lupinum/trellis-bridge`           | move/delete                  | type surface tests        |
| generated Nuxt aliases/auto-imports              | 1.0 generated contract              | keep/delete/move             | generated surface tests   |
| `trellis bridge` root CLI                        | bridge-owned tooling                | move/delete                  | CLI tests                 |
| `cms` starter                                    | Ginko-owned setup                   | delete from Trellis starters | CLI/starter tests         |
| `.tpl` starter source of truth                   | fixture manifest                    | replace                      | starter tests             |
| arity-based `authorize` inference                | explicit authorize object/function  | delete                       | audit report/tests        |
| `@lupinum/trellis/functions`                     | `@lupinum/trellis/backend`          | replace/delete               | public type tests/codemod |
| `workspace --mcp`                                | `workspace-mcp`                     | delete alias                 | CLI tests                 |
| `tsconfig.types.public.compat.json`              | `test:types:public`                 | delete                       | package scripts           |
| template-backed `trellis add` slices             | fixture/inventory-backed add slices | replace                      | CLI/add tests             |

### Done Means

- [x] Surface table is complete.
- [x] Each public item has an action.
- [x] Public-surface check has an expected 1.0 snapshot path.
- [x] No implementation slice starts with an unresolved public naming dependency.
- [x] Current generated aliases, auto-imports, and CLI commands are included in
      the public-surface snapshot, not tracked by separate ad hoc checks.

## Slice 2: Package And Subpath Shape

Status: done

Goal: make package boundaries match the 1.0 mental model without package
explosion.

### Keep

- [x] Root package remains `@lupinum/trellis`.
- [x] Auth, workspace, MCP, server, testing remain product layers/subpaths until
      a dependency graph proves separate packages are needed.
- [ ] ESLint stays separate if runtime package would otherwise pull tooling.
- [x] Sprint 52 added an executable runtime boundary policy to prevent
      public/core runtime roots from importing bridge, evlog delivery, ESLint
      tooling, devtools UI/tooling, or MCP implementation code by accident.
      Lightweight runtime devtools instrumentation remains allowed until a
      later devtools-specific cleanup replaces it.

### Move

- [ ] Move component bridge runtime/package-author APIs to
      `@lupinum/trellis-bridge`.
- [ ] Move bridge CLI support to the bridge package or a bridge-owned CLI
      boundary.
- [ ] Keep Ginko-shaped fixture in Trellis; keep full Ginko E2E outside Trellis.

### Delete

- [ ] Delete bridge exports from root/core.
- [x] Delete bridge exports from `@lupinum/trellis/backend`, including
      component bridge creation, manifest helpers, render helpers, and bridge
      package-author types.
- [ ] Delete old package-author bridge docs from normal app docs.
- [ ] Delete hidden internal import paths that become reachable by accident.

### Prove

- [x] Core package can build without bridge runtime imports.
- [x] Public/core apps do not load MCP, bridge, ESLint, or observability delivery
      code at runtime.
- [x] Dependency graph check proves root/core does not pull bridge, ESLint,
      evlog delivery, devtools UI, or other layer-specific implementation code
      into public/core runtime bundles.
- [x] Publish surface check catches removed public `functions` and backend
      export drift.

### Done Means

- [ ] Package boundaries are enforced by tests/checks, not only docs.
- [ ] Docs explain layers separately from npm packages.

## Slice 3: Backend Builder Hard Cut

Status: done

Goal: make public/protected/unsafe trust lanes explicit and delete ambiguous
builder spellings.

### Progress Notes

- Sprint 53 deleted arity-based `authorize` inference. Function authorize
  values are now treated as full actor/loaded/args/context checks, docs teach
  explicit object form for loaded-resource authorization, and
  `trellis upgrade --check` reports likely one-argument authorize callbacks
  without rewriting them.
- Sprint 54 replaced backend unsafe string bypasses with the shared typed
  `unsafe.permit(...)` primitive used by MCP custom tools. Runtime unsafe
  handlers now require `permit`, emit structured permit metadata, and upgrade
  audits only flag legacy/missing/non-typed unsafe entrypoints.
- Sprint 55 proved protected identity wiring fail-closed behavior. Missing
  `actor()` wiring now throws an actionable setup error in development/test
  when a protected path needs it, production treats it as denial, and resolved
  `null` actors remain ordinary unauthorized runtime state.
- Sprint 56 deleted the callable root backend builder shape. `query`,
  `mutation`, `action`, and internal builder exports are now lane containers
  only; operation/projection registration uses explicit protected lanes.

### Decide API

- [x] Choose final spelling for public handlers.
- [x] Choose final spelling for protected handlers.
- [x] Choose final spelling for unsafe handlers.
- [x] Choose final import subpath.

Candidate target:

```ts
query.public(...)
query.protected(...)
mutation.protected(...)
mutation.unsafe(...)
```

### Delete

- [x] Delete accidental-public behavior for plain backend handler objects.
- [x] Delete builder forms where missing guard can be interpreted as public for
      plain backend handler objects.
- [x] Delete arity-based `authorize` inference.
- [x] Delete string-only unsafe bypasses after typed permits cover the surface.

### Replace

- [x] Convert representative examples and harness fixtures to explicit lanes.
- [x] Convert beginner starter and resource generators to explicit lanes.
- [x] Convert focused backend tests to explicit lanes.
- [x] Replace unsafe bypass strings with typed `unsafe.permit(...)`.
- [x] Add audit report for authorization rewrites that cannot be proven safe.

### Prove

- [x] Missing public/protected/unsafe classification fails for plain backend
      handler objects.
- [x] Missing protected principal/actor wiring fails closed.
- [x] Public-access handlers do not require caller-supplied guard fields.
- [x] Resolved-null actor is distinct from missing actor resolver wiring.
- [x] Explicit lane metadata appears on registered function objects for
      tests/doctor/inventory to consume.

### Done Means

- [x] Old builder spelling has no runtime implementation.
- [x] Old builder docs are removed.
- [x] Tests prove no accidental public handler path remains.

## Slice 4: Signed Forwarding Hard Cut

Status: in progress

Goal: make signed forwarding the only production/default trusted-forwarding
path.

### Already Proven Locally

- [x] Compact JWS-like HS256 alpha envelope.
- [x] Top-level-only forwarding metadata exclusion in args hashing.
- [x] Unsupported canonical args values fail closed.
- [x] Expected function-ref verification.
- [x] Expected purpose/transport verification support.
- [x] Max TTL by purpose.
- [x] Max envelope size.
- [x] `operation-execute` shares confirmation token `jti`.
- [x] Destructive execute rejects confirmation/envelope `jti` mismatch.
- [x] Doctor validates destructive safety table fields and `by_jti`.
- [x] Forwarding benchmark exists.

### External Review

- [ ] Name external security-aware reviewer.
- [ ] Review HS256 versus asymmetric production signing.
- [ ] Review TTL matrix.
- [ ] Review replay model.
- [x] Review canonical args vectors.
- [x] Review raw fallback migration plan.
- [x] Record accepted changes in `meta/rfc-forwarding-envelope.md`.

### Delete

- [x] Delete raw `_trustedForwardingKey` validator from production/default path.
- [x] Delete raw `_trustedForwarding` parser from production/default path.
- [x] Delete raw forwarding tests after signed tests replace them.
- [x] Delete raw forwarding fields from default validators and test helpers, not
      only from runtime extraction.
- [x] Delete docs that teach raw forwarding.

### Replace

- [x] Server callers always sign `_trellisForwarding`.
- [x] MCP callers always sign `_trellisForwarding`.
- [x] Bridge callers always sign `_trellisForwarding`.
- [x] Mixed signed/raw forwarding is gone with the raw transport parser.
- [x] Raw fallback observability was used during migration and removed with the
      fallback parser.
- [x] Every forwarding-protected handler has an exact generated
      `trustedForwardingFunctionRef`; missing function-ref metadata fails
      closed.
- [x] MCP operation previews sign with `purpose: "operation-preview"` when
      forwarding is used.
- [x] Operation execute replay redemption has one source of truth at the
      backend/destructive execution boundary; MCP must not pre-redeem in a
      separate store for backend-mode destructive execution.

### Prove

- [x] Unknown `kid` fails.
- [x] Wrong audience fails.
- [x] Wrong issuer fails.
- [x] Wrong function ref fails.
- [x] Wrong purpose fails.
- [x] Wrong transport fails.
- [x] Args hash drift fails.
- [x] Excess TTL fails.
- [x] Expired token fails.
- [x] Oversized envelope fails.
- [x] Replayed operation execute fails.
- [x] Valid signed envelope plus raw forwarding fields no longer enters a raw
      parser path.
- [x] Raw fields are no longer default validator fields.
- [x] Operation preview forwarding uses the expected purpose and is covered.

### Done Means

- [x] No production/default raw trusted-forwarding path remains.
- [ ] RFC is accepted for 1.0.
- [ ] Tests cover every verifier failure class.

## Slice 5: Operation Descriptor Model

Status: in progress

Goal: make descriptors the cross-surface source of meaning and implementations
the backend source of behavior.

### Canonical Sources

- [x] Shared operation descriptor owns id, kind, args, result schema, permission
      key, safety class, labels.
- [x] Convex implementation owns guard, load, authorize, preview, execute,
      handler behavior.
- [x] Feature manifest includes descriptors.
- [x] App inventory composes feature manifests.
- [x] Generated refs bind descriptors to Convex API refs.

### Delete

- [x] Delete operation metadata inferred from implementation imports in MCP
      server files.
- [ ] Delete source scanning as the source of operation truth.
- [ ] Delete duplicated operation lists.

### Prove

- [x] Descriptor/implementation id drift fails.
- [x] Descriptor kind/projection drift fails.
- [x] Permission key drift fails.
- [x] Args/result schema drift fails.
- [x] Destructive operation without preview/execute projections fails.
- [x] MCP server files do not import Convex implementation modules.

### Done Means

- [x] Doctor/inventory can explain operations from descriptors and generated
      metadata.
- [x] Implementation remains backend-owned.

## Slice 6: MCP Blessed Lanes

Status: complete

Goal: keep MCP as a projection of the backend model, not a second backend.

### Keep

- [x] `mcp.tool.query(...)`.
- [x] `mcp.tool.mutation(...)` for bounded writes only.
- [x] `mcp.tool.operation(...)` for destructive, sensitive, audited, external,
      bulk, or previewed work.

### Delete

- [x] Delete public `tool.fromOperation(...)`.
- [x] Delete generic destructive MCP tool path.
- [x] Delete custom tool bypasses that can call protected Convex writes directly.
- [x] Delete MCP safety labels that exist only in the tool file.
- [x] Delete runtime/type aliases where `tool.operation` is implemented as
      `tool.fromOperation`.

### Replace

- [x] Direct mutation safety comes from backend/generated ref metadata.
- [x] MCP tool declaration may confirm/narrow safety but cannot down-classify.
- [x] External side-effect action work becomes operation-backed.
- [x] Generic custom tools require typed unsafe permit and non-app-write effect.
- [x] Doctor, error messages, safety scanners, codemods, and generated docs all
      teach `mcp.tool.operation(...)`, not `tool.fromOperation(...)`.

### Prove

- [x] Direct mutation without bounded-write metadata fails.
- [x] Tool-side down-classification fails.
- [x] Destructive work through direct mutation/custom tool fails.
- [x] Backend denial remains authoritative over MCP visibility.
- [x] Capability/backend drift emits observation.

### Done Means

- [x] MCP docs teach only query/mutation/operation lanes.
- [x] `tool.fromOperation` is gone.
- [x] No raw app-write escape hatch remains.

## Slice 7: Fixture-Backed Starters

Status: in progress

Goal: make tested fixture apps the source of starter generation.

### Already Proven Locally

- [x] `phase0-workspace-mcp` fixture has manifest.
- [x] Generated operation refs render from manifest metadata.
- [x] Generated MCP tool refs render from manifest metadata.
- [x] Fixture renderer respects includes/excludes.
- [x] Generated files are derived from manifest, not treated as canonical.

### Convert Starters

- [x] `public`.
- [x] `personal`.
- [x] `workspace`.
- [x] `workspace-mcp`.
- [x] `cms` is either deleted from Trellis 1.0 or replaced by the decided
      Ginko-owned/bridge-consumer path.

### Delete

- [x] Delete old `.tpl` files after each fixture-backed starter replaces them.
- [x] Delete duplicate starter source files.
- [x] Delete generated fixture artifacts from manifest includes.

### Prove

- [x] Each fixture builds.
- [x] Each fixture typechecks.
- [x] Each fixture passes doctor.
- [x] Each `trellis init --template ...` output matches fixture-rendered
      expectation.
- [x] No starter exposes concepts from disabled layers.

### Done Means

- [x] Starters are generated from fixtures.
- [x] Old template source of truth is gone.

## Slice 8: Inventory, Doctor, And Explain Foundation

Status: in progress

Goal: one inventory engine feeds doctor, upgrade checks, public-surface checks,
docs generation, and future explain commands.

### Build

- [x] Versioned inventory JSON schema.
- [x] Inventory reads app inventory first.
- [x] Inventory includes layers, features, permissions, operations, tools,
      unsafe permits, forwarding config, public surface, bridge packages.
- [x] Inventory JSON is safe to share: no secrets, raw envelopes, bearer tokens,
      raw principal/delegation payloads, confirmation payloads, or user data.

### Replace

- [x] Doctor reads inventory/finding engine.
- [x] Public surface checks reuse inventory where useful.
- [x] Upgrade `--check` uses inventory.
- [x] `explain operation <id>` uses inventory if included in 1.0.

### Delete

- [ ] Delete duplicated repo scanners.
- [ ] Delete regex/security-claim source scanning where structured metadata
      exists.

### Prove

- [x] Inventory schema is versioned.
- [x] Doctor and public-surface checks agree on operations/tools.
- [x] Security findings cite the metadata source they came from.

### Sprint Notes

- Sprint 32 moved trusted-forwarding and MCP source-code findings onto
  `inventory.forwarding` and `inventory.mcp`. Broader doctor, public-surface,
  upgrade, and explain replacement remain open.
- Sprint 33 moved unsafe backend entrypoints, cross-tenant escapes, and
  destructive operation source-code findings onto `inventory.backend`. Structured
  app inventory, public-surface, upgrade, and explain replacement remain open.
- Sprint 34 added static `shared/app-inventory.ts` discovery through
  `inventory.appInventory` without executing app source. The broad "reads app
  inventory first" item remains open until app-owned metadata feeds the wider
  inventory/finding source.
- Sprint 35 added `app-inventory-source`, the first doctor finding backed by
  `inventory.appInventory`; malformed/dynamic app inventory now warns from the
  app-owned inventory source.
- Sprint 36 added `inventory.publicSurface` from the existing public-surface
  extractor and `operation-tool-agreement`, a conservative doctor check for
  destructive operation/MCP tool drift.
- Sprint 37 is planned to add `trellis upgrade --check` as the first
  read-only inventory consumer outside doctor, focused on 1.0 hard-cut migration
  findings.
- Sprint 37 added read-only `trellis upgrade --check` and `--json`, backed by
  `TrellisCliInventory` for existing forwarding, MCP, and backend facts plus
  narrow detectors for old hard-cut path strings.
- Sprint 38 is planned to share finding report types, rendering, and
  failure-based exit behavior between doctor and upgrade before adding another
  inventory consumer.
- Sprint 38 added shared `FindingReport`, `renderFindingReport(...)`, and
  `exitCodeForFindings(...)` so doctor and upgrade use one report/summary/exit
  path while keeping their existing finding semantics.
- Sprint 39 is planned to move the refactor public-surface generator onto a
  shared script-local public-surface inventory helper without making scripts
  depend on built CLI internals.
- Sprint 39 moved the refactor public-surface generator onto
  `scripts/lib/public-surface-inventory.mjs`, keeping policy decisions in the
  generator while sharing package, generated surface, CLI, starter, and stale
  reference facts.
- Sprint 40 is planned to move `generate-api-surface.mjs` onto the same
  script-local public-surface inventory helper so docs generation and refactor
  surface checks share repo public-surface facts.
- Sprint 40 moved `generate-api-surface.mjs` onto
  `collectRepoPublicSurfaceInventory(...)`, removing duplicate docs-surface
  scanners while keeping generated API surface output stable.
- Sprint 41 is planned to add structured source metadata to doctor and upgrade
  findings so security findings can cite inventory paths and safe file/line
  evidence without parsing human-readable messages.
- Sprint 41 added `DoctorFinding.sources` plus shared source helpers, then
  annotated inventory-backed doctor/upgrade security findings with safe
  inventory/project-scan source metadata in JSON output.
- Sprint 42 is planned to add static feature and permission metadata to
  `TrellisCliInventory`, reusing existing permission extraction and avoiding a
  second operation/tool source of truth.
- Sprint 42 added `inventory.features` plus `inventory.permissions`, reusing
  existing permission metadata extraction while leaving operation/tool metadata
  owned by `inventory.publicSurface`.
- Sprint 43 is planned to replace location-only unsafe backend inventory with
  structured unsafe surface metadata so typed permit migration can use inventory
  instead of another scanner.
- Sprint 43 replaced location-only unsafe backend inventory with structured
  entries that record export name, surface kind, permit style, safe source
  location, and redacted typed-permit summary metadata.
- Sprint 44 is planned to add structured bridge package inventory so
  `layers.bridge` has explainable dependency/source evidence without loading
  bridge manifests or executing app code.
- Sprint 44 added `inventory.bridge` with static dependency/source-reference
  bridge package evidence and now derives `layers.bridge` from
  `inventory.bridge.enabled`, completing the broad inventory coverage checklist.
- Sprint 45 is planned to extract doctor's inventory-backed security findings
  into a focused inventory finding engine while keeping env/auth setup checks in
  the doctor command.
- Sprint 45 extracted inventory-backed doctor findings into
  `collectInventoryDoctorFindings(inventory)`, leaving env/auth/module-validation
  checks in the doctor command and permission usage diagnostics on the existing
  permission metadata helper.
- Sprint 46 is planned to cut permission definition/inventory drift findings
  over to `inventory.permissions`, leaving only projected permission usage on a
  project source scan until usage becomes structured inventory.
- Sprint 46 replaced doctor's duplicate permission metadata read with
  `collectPermissionInventoryFindings(inventory, project)`. Permission
  definitions and inventory drift now use `inventory.permissions`; projected
  permission usage remains an explicit source scan until usage is part of
  inventory.
- Sprint 47 is planned to add the first `trellis explain` surface:
  `trellis explain operation <id>`, backed by `TrellisCliInventory` operation,
  projection, feature, and MCP tool metadata.
- Sprint 47 added `trellis explain operation <id>` with human and versioned JSON
  output from `TrellisCliInventory`. Operation-specific MCP tool bindings are
  reported as not derivable until tool metadata carries operation ids.
- Sprint 48 is planned to reconcile Slice 9 with the current bridge package
  state, add or strengthen a directional boundary check proving core/runtime/CLI
  code does not import `@lupinum/trellis-bridge`, and mark only evidence-backed
  bridge extraction items complete.
- Sprint 49 is planned to close the local Slice 9 beginner-surface gaps by
  removing `cms` and `workspace --mcp` from first-reader starter docs, renaming
  generic resource scaffolding away from CMS-specific language, and keeping
  bridge/CMS references scoped to advanced package-integration material.
- Sprint 50 is planned to start Slice 10 by adding an internal observability
  sink boundary, routing evlog through that boundary, keeping test capture
  delivery-independent, and removing evlog delivery from the normal public
  observability barrel if it is not part of the 1.0 contract.
- Sprint 51 is planned to finish the local Slice 10 cleanup by deleting evlog
  delivery from core, removing the root evlog dependency/imports, replacing
  evlog-wide-summary coupling with no-op/core summary behavior, and closing
  observability as semantic events plus test capture rather than a log transport.

### Done Means

- [x] One inventory path explains the app.
- [x] Machine-readable output is stable and secret-safe.

## Slice 9: Bridge Extraction

Status: in progress

Goal: remove packaged integration machinery from the normal app surface.

### Progress Notes

- Sprint 48 reconciled this slice with earlier bridge package work. The bridge
  package boundary, manifest/runtime helpers, package tests, and root/backend
  export removals were already in place.
- Sprint 48 added a repo policy check that fails when `src` imports
  `@lupinum/trellis-bridge` or reaches into `packages/trellis-bridge`,
  preserving the core -> bridge dependency direction.
- Sprint 49 removed `cms` and `workspace --mcp` from first-reader starter docs,
  renamed generic resource scaffolding from `cms` to `author-owned`, and added a
  docs guardrail proving beginner starter docs teach `workspace-mcp` and not the
  deleted CMS starter.
- Package-author docs cleanup and full Ginko cross-repo E2E stay open because
  they are not proven by the local bridge package boundary tests.

### Move

- [x] Create `@lupinum/trellis-bridge` package boundary.
- [x] Move component bridge manifest helpers.
- [x] Move bridge install/check/generate/inspect support.
- [ ] Move package-author docs.

### Delete

- [x] Delete bridge exports from core/root/functions package.
- [x] Delete bridge concepts from beginner starter docs.
- [x] Delete any Ginko-specific naming from generic Trellis APIs.

### Keep

- [x] Keep minimal Ginko-shaped fixture in Trellis.
- [ ] Keep full Ginko E2E in Ginko repo.

### Prove

- [x] Core package does not import bridge.
- [x] Bridge package can use forwarding and backend descriptors without core
      depending on bridge.
- [x] Ginko-shaped fixture passes.
- [x] Bridge callers use signed envelopes with `transport: "bridge"` and exact
      component/root function refs.
- [x] Ginko-shaped fixture proves no raw bridge forwarding fields remain.

### Done Means

- [ ] Normal app authors do not see bridge unless they ask for packaged
      integrations.

## Slice 10: Observability Delivery Cleanup

Status: completed

Goal: keep event vocabulary in core while making delivery bounded and optional.

### Progress Notes

- Sprint 50 added an internal `ObservationSink` boundary, routed default evlog
  delivery through it, bounded async delivery, and removed `evlog-bridge` from
  the normal public observability barrel.
- Test capture remains delivery-independent and still receives redacted events
  when the delivery sink fails.
- Sprint 51 removed evlog delivery from core, deleted `evlog-bridge`, removed
  the root evlog dependency, and replaced runtime/MCP wide-summary coupling with
  internal core summary state that does not affect request correctness.

### Keep

- [x] Core owns event schema.
- [x] Core emits normalized/redacted events.
- [x] Testing capture remains easy.

### Move / Delete

- [x] Move evlog delivery out of core if it creates runtime/package weight.
- [x] Delete any sink API that can redefine schema, redaction, sampling,
      identity semantics, or request behavior.

### Prove

- [x] Sink receives already-redacted event.
- [x] Sink failure is fail-open.
- [x] Slow sink is bounded by timeout.
- [x] Tests can capture observations without delivery dependency.

### Done Means

- [x] Observability explains security decisions without becoming request
      correctness dependency.

## Slice 11: Migration, Codemods, And Hard Deletes

Status: in progress

Goal: make the hard cut understandable and verifiable even without compatibility
shims.

### Migration Table

| Old Pattern                                 | New Pattern               | Tooling            | Notes                            |
| ------------------------------------------- | ------------------------- | ------------------ | -------------------------------- |
| `tool.fromOperation(...)`                   | `mcp.tool.operation(...)` | codemod            | hard delete                      |
| raw forwarding args                         | `_trellisForwarding`      | codemod/manual     | production raw path deleted      |
| bridge core exports                         | `@lupinum/trellis-bridge` | codemod            | package boundary                 |
| arity authorize inference                   | explicit authorize        | audit report       | no silent rewrite                |
| string unsafe bypass                        | typed permit              | codemod where safe | strict mode default              |
| root backend builder calls                  | explicit backend lanes    | audit report       | no silent rewrite                |
| root operation/projection registration      | explicit protected lanes  | audit report       | no silent rewrite                |
| `.tpl` starters                             | fixture manifests         | generator          | old templates deleted            |
| `@lupinum/trellis/functions` bridge helpers | `@lupinum/trellis-bridge` | codemod            | no bridge exports from functions |
| `@lupinum/trellis/bridge`                   | `@lupinum/trellis-bridge` | codemod            | package boundary                 |
| `trellis bridge`                            | bridge-owned tooling      | CLI migration      | root CLI path deleted            |
| `workspace --mcp`                           | `workspace-mcp`           | CLI migration      | alias deleted                    |
| `cms` starter                               | Ginko-owned setup         | manual/docs        | Trellis starter deleted          |

### Sprint Notes

- Sprint 57 is planned to make `trellis upgrade --check` cover the already
  deleted 1.0 hard cuts with precise audit findings, starting with old root
  backend builder calls, deleted starter spellings, and old package/import
  paths. This is audit coverage only; it must not reintroduce old APIs or hidden
  aliases.
- Sprint 57 added import-aware `upgrade-backend-root-builder` audit coverage for
  deleted Trellis root builder calls and root operation/projection registration,
  strengthened deleted starter spelling findings, and documented the migration
  coverage map. Raw Convex builders remain out of scope unless they import
  Trellis builders.
- Sprint 58 is planned to delete the obsolete public compatibility type-check
  path (`tsconfig.types.public.compat.json` and `test:types:public:compat`) and
  rely on explicit 1.0 public type verification instead.
- Sprint 58 deleted the compat-named public type-check wrapper and package
  script. `test:types:public` is now the only 1.0 public type verification path,
  and aggregate `check`/`release:verify` no longer invoke a compatibility lane.

### Build

- [x] `trellis upgrade --check` or equivalent audit command.
- [x] Codemod for mechanical import/path renames.
- [x] Codemod for `tool.fromOperation`.
- [x] Audit report for authorize inference.
- [x] Audit report for unsafe bypasses that cannot be rewritten.

### Delete

- [x] Delete old paths after codemod tests pass.
- [x] Delete compatibility aliases not listed in this plan.

### Prove

- [x] Codemods are tested against fixtures.
- [x] Audit reports point to exact files/lines.
- [x] Removed imports fail loudly with useful diagnostics or TypeScript errors.
- [x] Compatibility test configs/scripts are deleted or renamed to explicit 1.0
      migration checks.

### Done Means

- [x] There is one supported 1.0 API shape.
- [x] Migration tooling exists for repo-local adopters.

## Cross-Repo Gate: Examples, Harness, And Ginko CMS

Status: pending

Goal: prove the new Trellis shape works in the real local consumers that shaped
the design, without letting them keep old Trellis paths alive.

### Trellis Examples And Harness

- [x] Decide which `examples/**`, `apps/harness`, docs app, and devtools UI
      targets remain for 1.0.
- [ ] Convert remaining examples and harnesses to explicit public/protected/
      unsafe builders.
- [ ] Convert remaining examples and harnesses to signed forwarding only.
- [ ] Convert remaining examples and harnesses to descriptor-backed operations
      and `mcp.tool.operation(...)`.
- [ ] Delete obsolete examples instead of preserving them as compatibility
      samples.

### Ginko CMS Package Cutover

- [x] Add `@lupinum/trellis-bridge` package dependency where Ginko package
      author code needs bridge APIs.
- [x] Migrate Ginko authored bridge manifest code, generated
      `convex/manifest.{js,d.ts}`, CLI bridge checks, module startup validation,
      and package dependencies away from `@lupinum/trellis/functions` and
      `@lupinum/trellis/bridge`.
- [x] Migrate Ginko component bridge factories, generated host refs, and test
      helpers from raw `_trustedForwardingKey` / `_trustedForwarding` fields to
      signed `_trellisForwarding` envelopes.
- [x] Migrate Ginko destructive MCP wrapper code from
      `rawMcpRuntime.tool.fromOperation(...)` to `mcp.tool.operation(...)`.
- [x] Update Ginko docs/setup examples so Ginko users see `ginko-cms init`,
      Ginko-owned bridge health commands, and Ginko terminology rather than
      Trellis bridge internals.
- [x] Keep Trellis historical notes only as historical notes; current Ginko
      docs must not teach old Trellis APIs.

### Prove

- [x] Trellis examples/harness validation passes for retained targets.
- [x] Packed Trellis packages install into Ginko CMS.
- [x] Ginko CMS `pnpm run check` passes with packed Trellis package-consumer
      validation.
- [x] Ginko CMS package-boundary and no-zombie-path tests pass after import
      updates.
- [x] Ginko destructive MCP confirmation tests pass using only
      `mcp.tool.operation(...)`.
- [x] Ginko bridge package/e2e validation proves no raw forwarding fields remain
      in generated or authored bridge paths.

### Done Means

- [x] The real bridge consumer does not rely on deleted Trellis APIs.
- [x] Ginko remains Ginko-owned product setup, not a Trellis starter by
      accident.

## Slice 12: Documentation Rewrite

Status: pending

Goal: docs teach only the new architecture and do not preserve old mental models.

### Rewrite

- [x] Front-door “Should you use Trellis?” section.
- [x] Public starter guide.
- [x] Personal starter guide.
- [x] Workspace starter guide.
- [x] Workspace MCP starter guide.
- [ ] Backend builder guide.
- [ ] Operation/destructive safety guide.
- [ ] MCP projection guide.
- [ ] Trusted forwarding security guide.
- [ ] Bridge package-author guide.
- [ ] Public API reference.

### Delete

- [x] Delete old raw forwarding docs.
- [x] Delete `tool.fromOperation` docs.
- [x] Delete `.tpl` starter docs.
- [x] Delete beginner bridge references.

### Prove

- [x] Docs API surface check passes.
- [ ] Public surface check passes.
- [x] Search for removed names returns only migration notes or historical ADRs.

### Done Means

- [ ] Docs match the code that ships.

## Slice 13: Final Cleanup And Release Gate

Status: pending

Goal: remove leftovers and make 1.0 feel like one designed system.

### Search And Delete

- [ ] Search old import paths.
- [ ] Search old builder names.
- [ ] Search raw forwarding fields.
- [ ] Search `tool.fromOperation`.
- [ ] Search bridge exports in core.
- [ ] Search `.tpl` starter sources.
- [ ] Search old docs snippets.
- [ ] Search TODO/compat/shim/legacy markers.

### Verify

- [x] Full unit suite.
- [x] Type checks.
- [x] Lint/format checks.
- [x] Docs API surface.
- [x] Publish surface.
- [x] Fixture starter generation.
- [x] Doctor on generated starters.
- [x] Forwarding benchmark.
- [x] Bridge fixture tests.
- [ ] Cross-repo examples/harness/Ginko gate.

### Release Gate

- [ ] Public surface diff reviewed with rationale.
- [ ] ADR impact updated.
- [ ] Security review notes recorded.
- [ ] 0.x support/migration window stated.
- [ ] 1.0 lifecycle statement confirmed.

### Sprint Notes

- Sprint 59 repaired the aggregate `test:types` gate after the hard cuts.
  Starter/add fixture source is excluded from the root Nuxt typecheck and still
  covered by starter validation, backend re-exports the operation registry types
  consumed by `type-primitives`, maintained examples share the current Convex
  dependency set, and stale confirmation-token imports in example tests now use
  the canonical functions path.
- Sprint 60 repaired the full `pnpm run lint` gate and the Slice 13
  lint/format gate. The cleanup kept the fixes narrow: fixture page naming,
  upgrade regex simplification, unused fixture imports, permission overload
  consolidation, backend function type lint debt, and one MCP type-test
  assertion pattern.
- Sprint 61 completed the local release verification sweep. Full `test:repo`
  passes, the forwarding benchmark reports p99 `0.1345ms`, and bridge-focused
  package/component tests pass. The sprint also fixed a concurrent `build:cli`
  fixture-copy race and updated stale expectations around server auth error
  context, Better Auth 401 categorization, and Convex cross-process observation
  capture.
- Sprint 62 added the first write-mode migration tooling for Trellis 1.0.
  `trellis upgrade --write` now applies only mechanical import/path renames and
  direct `tool.fromOperation(...)` spelling changes when an `mcp` binding is
  present. Authorization, raw forwarding, unsafe permits, and backend lane
  classification remain audit-only.
- Sprint 63 hardened the remaining Slice 11 audit path. Token findings now
  report every affected line, authorize arity audit is AST-backed and manual,
  deleted import paths are covered by public type tests, and write mode remains
  limited to mechanical codemods.
- Sprint 64 closed the local Slice 11 hard-cut cleanup by deleting the hidden
  `@lupinum/trellis/functions` Vitest aliases and adding a public-surface test
  that prevents deleted public specifiers from returning through test config.
  Remaining old strings are migration tooling/test input, deleted-path
  assertions, or historical/meta inventory text. Cross-repo examples/Ginko
  validation remains the next gate.
- Sprint 65 is planned to establish the cross-repo gate baseline before editing
  Ginko. It should decide retained Trellis examples/harness/docs/devtools
  targets, add or identify a repeatable old-path validation gate for retained
  targets, and record Ginko's active old-path migration surface.
- Sprint 65 established the local cross-repo gate baseline. Retained targets
  are: `examples/01-public-todo`, `examples/02-auth-todo`,
  `examples/03-team-workspace`, `examples/04-saas-platform`,
  `examples/05-visibility-access`, `examples/06-multi-workspace`,
  `examples/07-mcp-reference`, `examples/08-component-mini-cms`,
  `apps/harness`, `apps/docs`, and `apps/devtools-ui`. `check:repo-policies`
  now scans retained examples/apps for deleted Trellis 1.0 surfaces, and
  `check:examples:doctor` passes for maintained examples. Ginko already depends
  on `@lupinum/trellis-bridge`; the first active migration target is
  `packages/cms/src/server/mcp/runtime.ts`
  `rawMcpRuntime.tool.fromOperation(...)`.
- Sprint 66 is planned to migrate that single active Ginko MCP operation binding
  from `rawMcpRuntime.tool.fromOperation(...)` to
  `rawMcpRuntime.tool.operation(...)`, leaving broader Ginko bridge/raw
  forwarding/package validation open until their own focused sprint.
- Sprint 66 completed the Ginko MCP operation binding cutover. Ginko
  `packages/cms/src/server/mcp/runtime.ts` now routes destructive tools through
  `rawMcpRuntime.tool.operation(...)`; focused Ginko MCP/package-boundary tests
  pass and only negative test assertions mention `tool.fromOperation(...)`.
- Sprint 67 is planned to close the Ginko bridge package-boundary items with
  evidence: package dependencies, authored bridge imports, CLI bridge ownership,
  and focused Ginko package-boundary/manifest/module-bridge tests. It should
  leave raw forwarding and full packed-package validation open.
- Sprint 67 closed the Ginko bridge package-boundary items by verification.
  Root, CMS, and Convex packages declare `@lupinum/trellis-bridge`; authored
  bridge manifest, module validation, and CLI bridge code import from
  `@lupinum/trellis-bridge`; package-boundary, manifest, module-bridge,
  publish-specifier, and installer bridge-boundary checks pass. Raw forwarding
  and full packed-package validation remain open.
- Sprint 68 is planned to cut over Ginko generated bridge forwarding artifacts.
  Authored Ginko bridge code already emits signed `_trellisForwarding`; the
  remaining raw `_trustedForwardingKey` / `_trustedForwarding` hits are in
  generated component refs and should be removed through the maintained
  generator/regeneration path plus a no-raw-forwarding guardrail.
- Sprint 68 completed the Ginko generated forwarding cutover. Ginko bridge
  factories now sign explicit `module:function` refs, bridge-exposed handlers
  carry matching signed-forwarding metadata, Convex component codegen
  regenerated `packages/convex/src/_generated/component.ts` with
  `_trellisForwarding?: string`, and package-boundary guardrails reject live raw
  forwarding fields. Focused Ginko bridge/backup/workflow/package-boundary tests
  pass. Full packed-package validation and Ginko docs/setup wording remain open.
- Sprint 69 is planned to close the Ginko Convex declaration portability blocker
  found in Sprint 68. The focused Ginko Convex package typecheck currently
  fails during declaration emit because exported registered-function types infer
  through Trellis' workspace `convex/server` dependency path. The sprint should
  fix that with one clean type boundary, not broad per-handler annotations, and
  should leave packed-package validation and docs/setup wording open unless
  those gates actually pass.
- Sprint 69 completed the Ginko Convex declaration portability gate. Ginko's
  Convex package now preserves workspace symlink package boundaries during
  declaration emit, Trellis exports the `PermissionFlags` type needed by public
  permission-context definitions, and stale Ginko bridge-module call sites were
  cut over to explicit `functionRefModule` inputs. Focused Ginko bridge tests,
  Ginko Convex package typecheck, full Ginko `pnpm run typecheck`, Trellis
  focused backend/forwarding/bridge tests, and Trellis repo-policy checks pass.
  Full `pnpm run check`, packed Trellis install validation, and Ginko docs/setup
  wording remain open.
- Sprint 70 is planned to run and close the full local Ginko CMS quality gate.
  The sprint should make Ginko `pnpm run check` pass without weakening checks,
  restoring old Trellis paths, or widening scope into packed-package validation.
  It should also clean current Ginko setup/docs wording only where targeted
  scans prove users still see deleted Trellis APIs or bridge internals.
- Sprint 70 completed the full local Ginko CMS quality gate. Formatting drift
  was normalized, exact signed-forwarding metadata was added to the asset
  reference rebuild mutation, public API expectations were updated for stricter
  data-only and unsupported-locale behavior, and the package-consumer fixture now
  installs packed Trellis root and bridge tarballs. Full Ginko `pnpm run check`
  passes, including the packed package-consumer validation. The deleted-path scan
  found only intentional package-boundary/no-zombie-path tests; current Ginko
  docs/setup output does not teach deleted Trellis APIs.
- Sprint 71 is planned to start Slice 12 with the current user-facing docs front
  door. The sprint should establish a stale-surface baseline, rewrite only
  `README.md`, the docs index, and first-reader getting-started/concepts pages
  as needed, and add or reuse a repeatable docs guardrail for deleted 1.0
  surfaces. Deeper guide/API-reference rewrites stay open unless this sprint
  edits and verifies them.
- Sprint 71 completed the docs front-door 1.0 cleanup. The current-docs stale
  surface scan found no raw forwarding, deleted bridge import, `workspace --mcp`,
  `cms` starter, `.tpl`, `guard: open`, or `tool.fromOperation` hits; legitimate
  `query(...)` / `mutation(...)` hits were client/server/test/MCP examples, not
  old backend builders. The docs landing page now starts with fixture-backed
  `trellis init`, start-here makes `trellis doctor` part of the first loop, the
  concepts page states signed forwarding is transport authentication rather than
  authorization, and the backend API reference no longer lists bridge helpers or
  old operation projection wording.
- Sprint 72 is planned to continue Slice 12 with the four official starter guide
  paths: `public`, `personal`, `workspace`, and `workspace-mcp`. The sprint
  should prove or tighten the linked getting-started, permissions, MCP, and
  examples pages so they read as one progressive fixture-backed starter ladder,
  and should mark beginner bridge references complete only if bridge concepts
  are scoped to advanced/package-author material.
- Sprint 72 completed the starter guide ladder cleanup. Public, personal, and
  workspace guide pages were already aligned with their official starters; the
  MCP getting-started guide now starts from `--template workspace-mcp` and names
  the read -> bounded-write -> operation-backed destructive progression. The
  docs examples page and repo examples README now label `07-mcp-reference` as
  the workspace-MCP branch and `08-component-mini-cms` as advanced
  package-integration material, keeping bridge concepts out of beginner starter
  setup.

### Done Means

- [ ] No parallel implementation remains.
- [ ] No old public path remains unless explicitly listed in this plan.
- [ ] Trellis 1.0 has one coherent architecture.

IMPORTANT: If everything is finsihed, and you are still prompted to create a new sprint plan, make sure everyting is properly reviewed, and fixed, everything in full ooptimal state, no debt, straight forward code,..
