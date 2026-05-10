# Sprint 31: Inventory JSON Foundation

## Goal

Start Slice 8 by creating one explicit, versioned, secret-safe inventory JSON
producer for inspected Trellis apps.

By the end of this sprint, the repo should have a small inventory foundation
that:

- emits `schemaVersion: 1`;
- can be called by CLI code without duplicating doctor scans;
- includes conservative app facts that doctor already knows how to inspect;
- is safe to paste into issues or CI logs;
- is included in `trellis doctor --json` output without changing human output.

This is the first inventory sprint, not the full `explain` or upgrade system.

## Why This Sprint Comes Next

Slice 7 is complete: retained starters render, pass doctor, typecheck, and
build as generated consumer apps.

The next plan item is Slice 8:

```text
one inventory engine feeds doctor, upgrade checks, public-surface checks,
docs generation, and future explain commands
```

The lowest-risk first move is not to rewrite doctor. It is to introduce the
canonical inventory output and make doctor expose it. Once that exists, later
sprints can move existing findings and surface checks onto the same source.

## Current State

- Runtime feature inventories already exist through `defineAppInventory(...)`
  and `toAppInventoryJson(...)`.
- `trellis doctor` currently builds findings from `inspectProject(...)` plus
  focused project scanners.
- Public-surface checks and refactor-surface checks are still separate scripts.
- Doctor JSON currently reports `cwd`, `findings`, and `summary`, but not a
  reusable app inventory object.

This sprint should add the CLI-side inventory foundation without pretending it
can already evaluate every descriptor or public surface.

## Non-Goals

- Do not implement `trellis explain`.
- Do not implement `trellis upgrade --check`.
- Do not rewrite every doctor finding to consume inventory in one sprint.
- Do not replace public-surface or docs-surface checks yet.
- Do not execute arbitrary app code to load `shared/app-inventory.ts`.
- Do not include secrets, raw env values, raw forwarding envelopes, bearer
  tokens, principal/delegation payloads, confirmation payloads, or user data.
- Do not add compatibility paths or a second doctor command.

## Design Target

### One CLI Inventory Module

Add a focused CLI library module, likely:

```text
src/cli/lib/inventory.ts
```

It should take the existing inspected project shape from
`src/cli/lib/project.ts` and produce a serializable object.

Initial inventory shape:

```ts
type TrellisCliInventory = {
  schemaVersion: 1
  cwd: string
  package: {
    hasPackageJson: boolean
    hasTrellisDependency: boolean
    hasNuxtDependency: boolean
    hasConvexDependency: boolean
  }
  layers: {
    core: boolean
    auth: boolean
    workspace: boolean
    mcp: boolean
    bridge: boolean
  }
  files: {
    nuxtConfig: string | null
    convexHttp: string | null
    convexAuth: string | null
    appInventory: string | null
  }
  surfaces: {
    trustedForwarding: boolean
    permissions: boolean
    destructiveOperations: number
    unsafeEntrypoints: number
    crossTenantEscapes: number
    mcpTools: number
    customMcpToolsWithAppWrites: number
  }
  findings: []
}
```

The exact property names can change during implementation, but the output must
be versioned and intentionally safe.

### Source Tracking

Every inventory section should be derived from one of:

- package metadata;
- known file presence;
- existing structured project inspection;
- existing focused scanners already used by doctor.

Do not invent broad new regex scanners if doctor already has a scanner for the
same fact. This sprint should consolidate, not multiply, scan paths.

### Doctor JSON Includes Inventory

`trellis doctor --json` should include:

```json
{
  "cwd": "...",
  "inventory": {
    "schemaVersion": 1
  },
  "findings": [],
  "summary": {}
}
```

Human doctor output should remain unchanged unless a small internal refactor
falls out naturally.

### Secret Safety

Inventory JSON must be safe to share. It may include whether a key exists and
where it was found by file/source label, but not the key value.

Explicitly forbidden:

- raw `.env` values;
- raw forwarding envelopes;
- raw trusted-forwarding keys;
- bearer tokens;
- raw principal/delegation payloads;
- `sub` values;
- `jti` values;
- tenant keys or confirmation payloads;
- user-authored database/content data.

## Work Items

### 1. Add Inventory Types And Collector

- [ ] Add a CLI inventory type with `schemaVersion: 1`.
- [ ] Add a collector that accepts the existing `inspectProject(...)` output.
- [ ] Derive initial layer facts: core, auth, workspace, MCP, bridge.
- [ ] Derive initial package/dependency facts.
- [ ] Derive initial file-presence facts.
- [ ] Derive initial surface counts from existing doctor scanner helpers.

### 2. Add Doctor JSON Inventory

- [ ] Extend `DoctorReport` to include `inventory`.
- [ ] Build inventory once and pass it into doctor report creation.
- [ ] Keep human doctor output unchanged.
- [ ] Ensure doctor findings and inventory do not disagree for the same basic
      facts in generated starter apps.

### 3. Add Secret-Safety Tests

- [ ] Add tests proving inventory has `schemaVersion: 1`.
- [ ] Add tests proving doctor JSON includes inventory.
- [ ] Add tests proving inventory does not include raw env values or known
      secret fixture strings.
- [ ] Add tests for generated `public`, `personal`, `workspace`, and
      `workspace-mcp` starter inventories.

### 4. Update Slice 8 Tracker

- [ ] Mark `Versioned inventory JSON schema` complete if implemented.
- [ ] Mark `Inventory JSON is safe to share` complete only if tests prove it.
- [ ] Leave doctor/full public-surface replacement unchecked unless actually
      completed.
- [ ] Add sprint exit notes with the exact inventory fields shipped.

## Verification

Focused unit checks:

```bash
pnpm exec vitest run --project=unit \
  tests/unit/cli-doctor.test.ts \
  tests/unit/phase0-starter-manifest.test.ts \
  tests/unit/feature-compose.test.ts
```

Starter proof checks:

```bash
pnpm run check:starter-fixtures
```

Surface checks:

```bash
pnpm run check:docs:api-surface
pnpm run check:publish-surface
pnpm run check:refactor:surface:inventory
pnpm run check:cli
```

Formatting/diff checks:

```bash
git diff --check
pnpm exec oxfmt --check src/cli/lib/inventory.ts src/cli/commands/doctor.ts tests/unit/cli-doctor.test.ts
```

## Acceptance Criteria

- [ ] A repo-owned CLI inventory collector exists.
- [ ] Inventory JSON has `schemaVersion: 1`.
- [ ] `trellis doctor --json` includes the inventory object.
- [ ] Human doctor output remains stable.
- [ ] Inventory JSON is secret-safe by test.
- [ ] Generated starters expose sensible layer/package/surface inventory.
- [ ] No broad new scanner duplicates an existing doctor scanner.
- [ ] Slice 8 tracker is updated.
- [ ] Sprint changes are committed after verification.

## Exit Notes

Pending.

## Next Sprint Candidate

If this lands cleanly, Sprint 32 should move one high-value doctor area onto the
inventory source instead of reading project scans directly. Good candidates:

- MCP/trusted-forwarding surface facts; or
- unsafe/destructive operation inventory facts.

Pick one area, remove the duplicated direct reads for that area, and prove the
doctor finding cites the inventory source.
