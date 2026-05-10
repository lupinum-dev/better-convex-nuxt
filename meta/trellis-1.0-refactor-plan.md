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
| `tsconfig.types.public.compat.json`              | 1.0 public-surface/migration checks | replace/delete               | package scripts           |
| template-backed `trellis add` slices             | fixture/inventory-backed add slices | replace                      | CLI/add tests             |

### Done Means

- [x] Surface table is complete.
- [x] Each public item has an action.
- [x] Public-surface check has an expected 1.0 snapshot path.
- [x] No implementation slice starts with an unresolved public naming dependency.
- [x] Current generated aliases, auto-imports, and CLI commands are included in
      the public-surface snapshot, not tracked by separate ad hoc checks.

## Slice 2: Package And Subpath Shape

Status: in progress

Goal: make package boundaries match the 1.0 mental model without package
explosion.

### Keep

- [x] Root package remains `@lupinum/trellis`.
- [x] Auth, workspace, MCP, server, testing remain product layers/subpaths until
      a dependency graph proves separate packages are needed.
- [ ] ESLint stays separate if runtime package would otherwise pull tooling.

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

- [ ] Core package can build without bridge runtime imports.
- [ ] Public/core apps do not load MCP, bridge, ESLint, or observability delivery
      code at runtime.
- [ ] Dependency graph check proves root/core does not pull bridge, ESLint,
      evlog delivery, devtools UI, or other layer-specific implementation code
      into public/core runtime bundles.
- [x] Publish surface check catches removed public `functions` and backend
      export drift.

### Done Means

- [ ] Package boundaries are enforced by tests/checks, not only docs.
- [ ] Docs explain layers separately from npm packages.

## Slice 3: Backend Builder Hard Cut

Status: in progress

Goal: make public/protected/unsafe trust lanes explicit and delete ambiguous
builder spellings.

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
- [ ] Delete arity-based `authorize` inference.
- [ ] Delete string-only unsafe bypasses after typed permits cover the surface.

### Replace

- [x] Convert representative examples and harness fixtures to explicit lanes.
- [x] Convert beginner starter and resource generators to explicit lanes.
- [x] Convert focused backend tests to explicit lanes.
- [ ] Replace unsafe bypass strings with typed `unsafe.permit(...)`.
- [ ] Add audit report for authorization rewrites that cannot be proven safe.

### Prove

- [x] Missing public/protected/unsafe classification fails for plain backend
      handler objects.
- [ ] Missing protected principal/actor wiring fails closed.
- [x] Public-access handlers do not require caller-supplied guard fields.
- [ ] Resolved-null actor is distinct from missing actor resolver wiring.
- [x] Explicit lane metadata appears on registered function objects for
      tests/doctor/inventory to consume.

### Done Means

- [ ] Old builder spelling has no runtime implementation.
- [ ] Old builder docs are removed.
- [ ] Tests prove no accidental public handler path remains.

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
- [ ] Inventory reads app inventory first.
- [ ] Inventory includes layers, features, permissions, operations, tools,
      unsafe permits, forwarding config, public surface, bridge packages.
- [x] Inventory JSON is safe to share: no secrets, raw envelopes, bearer tokens,
      raw principal/delegation payloads, confirmation payloads, or user data.

### Replace

- [ ] Doctor reads inventory/finding engine.
- [ ] Public surface checks reuse inventory where useful.
- [ ] Upgrade `--check` uses inventory.
- [ ] `explain operation <id>` uses inventory if included in 1.0.

### Delete

- [ ] Delete duplicated repo scanners.
- [ ] Delete regex/security-claim source scanning where structured metadata
      exists.

### Prove

- [x] Inventory schema is versioned.
- [ ] Doctor and public-surface checks agree on operations/tools.
- [ ] Security findings cite the metadata source they came from.

### Done Means

- [ ] One inventory path explains the app.
- [x] Machine-readable output is stable and secret-safe.

## Slice 9: Bridge Extraction

Status: pending

Goal: remove packaged integration machinery from the normal app surface.

### Move

- [ ] Create `@lupinum/trellis-bridge` package boundary.
- [ ] Move component bridge manifest helpers.
- [ ] Move bridge install/check/generate/inspect support.
- [ ] Move package-author docs.

### Delete

- [ ] Delete bridge exports from core/root/functions package.
- [ ] Delete bridge concepts from beginner starter docs.
- [ ] Delete any Ginko-specific naming from generic Trellis APIs.

### Keep

- [ ] Keep minimal Ginko-shaped fixture in Trellis.
- [ ] Keep full Ginko E2E in Ginko repo.

### Prove

- [ ] Core package does not import bridge.
- [ ] Bridge package can use forwarding and backend descriptors without core
      depending on bridge.
- [x] Ginko-shaped fixture passes.
- [x] Bridge callers use signed envelopes with `transport: "bridge"` and exact
      component/root function refs.
- [x] Ginko-shaped fixture proves no raw bridge forwarding fields remain.

### Done Means

- [ ] Normal app authors do not see bridge unless they ask for packaged
      integrations.

## Slice 10: Observability Delivery Cleanup

Status: pending

Goal: keep event vocabulary in core while making delivery bounded and optional.

### Keep

- [ ] Core owns event schema.
- [ ] Core emits normalized/redacted events.
- [ ] Testing capture remains easy.

### Move / Delete

- [ ] Move evlog delivery out of core if it creates runtime/package weight.
- [ ] Delete any sink API that can redefine schema, redaction, sampling,
      identity semantics, or request behavior.

### Prove

- [ ] Sink receives already-redacted event.
- [ ] Sink failure is fail-open.
- [ ] Slow sink is bounded by timeout.
- [ ] Tests can capture observations without delivery dependency.

### Done Means

- [ ] Observability explains security decisions without becoming request
      correctness dependency.

## Slice 11: Migration, Codemods, And Hard Deletes

Status: pending

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
| `.tpl` starters                             | fixture manifests         | generator          | old templates deleted            |
| `@lupinum/trellis/functions` bridge helpers | `@lupinum/trellis-bridge` | codemod            | no bridge exports from functions |
| `@lupinum/trellis/bridge`                   | `@lupinum/trellis-bridge` | codemod            | package boundary                 |
| `trellis bridge`                            | bridge-owned tooling      | CLI migration      | root CLI path deleted            |
| `workspace --mcp`                           | `workspace-mcp`           | CLI migration      | alias deleted                    |
| `cms` starter                               | Ginko-owned setup         | manual/docs        | Trellis starter deleted          |

### Build

- [ ] `trellis upgrade --check` or equivalent audit command.
- [ ] Codemod for mechanical import/path renames.
- [ ] Codemod for `tool.fromOperation`.
- [ ] Audit report for authorize inference.
- [ ] Audit report for unsafe bypasses that cannot be rewritten.

### Delete

- [ ] Delete old paths after codemod tests pass.
- [ ] Delete compatibility aliases not listed in this plan.

### Prove

- [ ] Codemods are tested against fixtures.
- [ ] Audit reports point to exact files/lines.
- [ ] Removed imports fail loudly with useful diagnostics or TypeScript errors.
- [ ] Compatibility test configs/scripts are deleted or renamed to explicit 1.0
      migration checks.

### Done Means

- [ ] There is one supported 1.0 API shape.
- [ ] Migration tooling exists for repo-local adopters.

## Cross-Repo Gate: Examples, Harness, And Ginko CMS

Status: pending

Goal: prove the new Trellis shape works in the real local consumers that shaped
the design, without letting them keep old Trellis paths alive.

### Trellis Examples And Harness

- [ ] Decide which `examples/**`, `apps/harness`, docs app, and devtools UI
      targets remain for 1.0.
- [ ] Convert remaining examples and harnesses to explicit public/protected/
      unsafe builders.
- [ ] Convert remaining examples and harnesses to signed forwarding only.
- [ ] Convert remaining examples and harnesses to descriptor-backed operations
      and `mcp.tool.operation(...)`.
- [ ] Delete obsolete examples instead of preserving them as compatibility
      samples.

### Ginko CMS Package Cutover

- [ ] Add `@lupinum/trellis-bridge` package dependency where Ginko package
      author code needs bridge APIs.
- [ ] Migrate Ginko authored bridge manifest code, generated
      `convex/manifest.{js,d.ts}`, CLI bridge checks, module startup validation,
      and package dependencies away from `@lupinum/trellis/functions` and
      `@lupinum/trellis/bridge`.
- [ ] Migrate Ginko component bridge factories, generated host refs, and test
      helpers from raw `_trustedForwardingKey` / `_trustedForwarding` fields to
      signed `_trellisForwarding` envelopes.
- [ ] Migrate Ginko destructive MCP wrapper code from
      `rawMcpRuntime.tool.fromOperation(...)` to `mcp.tool.operation(...)`.
- [ ] Update Ginko docs/setup examples so Ginko users see `ginko-cms init`,
      Ginko-owned bridge health commands, and Ginko terminology rather than
      Trellis bridge internals.
- [ ] Keep Trellis historical notes only as historical notes; current Ginko
      docs must not teach old Trellis APIs.

### Prove

- [ ] Trellis examples/harness validation passes for retained targets.
- [ ] Packed Trellis packages install into Ginko CMS.
- [ ] Ginko CMS `pnpm run check` passes against packed Trellis packages.
- [ ] Ginko CMS package-boundary and no-zombie-path tests pass after import
      updates.
- [ ] Ginko destructive MCP confirmation tests pass using only
      `mcp.tool.operation(...)`.
- [ ] Ginko bridge package/e2e validation proves no raw forwarding fields remain
      in generated or authored bridge paths.

### Done Means

- [ ] The real bridge consumer does not rely on deleted Trellis APIs.
- [ ] Ginko remains Ginko-owned product setup, not a Trellis starter by
      accident.

## Slice 12: Documentation Rewrite

Status: pending

Goal: docs teach only the new architecture and do not preserve old mental models.

### Rewrite

- [ ] Front-door “Should you use Trellis?” section.
- [ ] Public starter guide.
- [ ] Personal starter guide.
- [ ] Workspace starter guide.
- [ ] Workspace MCP starter guide.
- [ ] Backend builder guide.
- [ ] Operation/destructive safety guide.
- [ ] MCP projection guide.
- [ ] Trusted forwarding security guide.
- [ ] Bridge package-author guide.
- [ ] Public API reference.

### Delete

- [ ] Delete old raw forwarding docs.
- [ ] Delete `tool.fromOperation` docs.
- [ ] Delete `.tpl` starter docs.
- [ ] Delete beginner bridge references.

### Prove

- [ ] Docs API surface check passes.
- [ ] Public surface check passes.
- [ ] Search for removed names returns only migration notes or historical ADRs.

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

- [ ] Full unit suite.
- [ ] Type checks.
- [ ] Lint/format checks.
- [ ] Docs API surface.
- [ ] Publish surface.
- [ ] Fixture starter generation.
- [ ] Doctor on generated starters.
- [ ] Forwarding benchmark.
- [ ] Bridge fixture tests.
- [ ] Cross-repo examples/harness/Ginko gate.

### Release Gate

- [ ] Public surface diff reviewed with rationale.
- [ ] ADR impact updated.
- [ ] Security review notes recorded.
- [ ] 0.x support/migration window stated.
- [ ] 1.0 lifecycle statement confirmed.

### Done Means

- [ ] No parallel implementation remains.
- [ ] No old public path remains unless explicitly listed in this plan.
- [ ] Trellis 1.0 has one coherent architecture.
