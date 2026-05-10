# Sprint 32: Inventory-Backed Forwarding Doctor

## Goal

Make the first security-sensitive doctor area read from the new CLI inventory
path instead of directly owning its own project-scan facts.

This sprint should prove the Slice 8 direction in a small, concrete way:

- collect trusted-forwarding and MCP surface facts once;
- expose those facts through versioned inventory JSON;
- make doctor forwarding/MCP findings consume that inventory-backed source;
- keep raw secret values out of machine output;
- keep human doctor output unchanged.

This is not the full inventory engine. It is the first replacement of a doctor
finding family onto the inventory source.

## Why This Sprint Comes Next

Sprint 31 added `src/cli/lib/inventory.ts` and included `inventory` in
`trellis doctor --json`. The collector already computes trusted-forwarding,
MCP misuse, destructive MCP misuse, and MCP rate-limit facts, but doctor still
mostly treats them as local variables.

The smallest useful next move is to make one high-risk area inventory-backed
end to end. Trusted-forwarding/MCP is the right first area because:

- it is central to Trellis 1.0 security;
- it already has meaningful doctor coverage;
- it has a clear acceptance test surface;
- it lets us remove duplicate direct scanner imports from doctor;
- it gives future `explain` and `upgrade --check` a concrete data source.

## Current State

- `collectTrellisCliInventoryFacts(project)` computes reusable scanner facts.
- `collectTrellisCliInventory(project, facts)` emits summary counts.
- `buildDoctorReport(...)` passes shared facts into doctor finding creation.
- Doctor forwarding/MCP findings still read from local variables instead of an
  explicit inventory subsection.
- Inventory `surfaces` contains counts/booleans, but not source-backed entries
  that findings can cite directly.

## Non-Goals

- Do not implement `trellis explain`.
- Do not implement `trellis upgrade --check`.
- Do not replace every doctor finding.
- Do not execute app source to load `shared/app-inventory.ts`.
- Do not add a second doctor command or a compatibility output mode.
- Do not add broad new source scanners.
- Do not expose raw env values, raw forwarding envelopes, bearer tokens,
  principal/delegation payloads, subjects, JTIs, tenant keys, or confirmation
  payloads.

## Design Target

### Forwarding/MCP Inventory Section

Extend the inventory shape with a focused section for forwarding and MCP facts,
for example:

```ts
type TrellisCliInventory = {
  schemaVersion: 1
  forwarding: {
    expected: boolean
    publicExposures: ProjectSourceLocation[]
    forwardedPrincipalMisuses: ProjectSourceLocation[]
  }
  mcp: {
    toolCount: number
    destructiveToolMisuses: ProjectSourceLocation[]
    customAppWriteMisuses: ProjectSourceLocation[]
    rateLimit: {
      expected: boolean
      store: 'supported' | 'unverified' | 'none'
    }
  }
}
```

The exact names can change during implementation, but the inventory should carry
the source locations that doctor needs to cite. The existing summary counts can
remain in `surfaces` if useful, but the detailed inventory should become the
source doctor reads.

### Doctor Reads Inventory

Doctor should use the inventory section for these findings:

- `trusted-forwarding-key-source`
- `trusted-forwarding-key-strength`
- `trusted-forwarding-key-public-exposure`
- `forwarded-principal-path`
- `mcp-rate-limit-store`
- `destructive-mcp-operation-binding`
- `mcp-custom-app-write-bypass`

Doctor may still read env key sources directly for configured key presence and
quality, because env values must not be placed into inventory. The important
cutover is that source-code facts and misuse locations come from inventory.

### Secret-Safe Source Locations

Source locations may include file path, line, column, and matched surface label.
They must not include snippets containing identity, env values, envelope values,
tokens, principal payloads, delegation payloads, subjects, JTIs, tenant keys, or
confirmation material.

If the existing `ProjectSourceLocation` shape includes a `snippet`, this sprint
must either prove those snippets are safe for the forwarding/MCP inventory or
map them to a redacted location shape before emitting JSON.

Prefer a simple safe location type over carrying rich snippets forward.

## Work Items

### 1. Extend Inventory Shape

- [ ] Add explicit `forwarding` and `mcp` sections to `TrellisCliInventory`.
- [ ] Include source-backed forwarding/MCP misuse arrays needed by doctor.
- [ ] Keep existing `surfaces` summary fields stable unless there is a clear
      reason to delete or rename them.
- [ ] Use one safe source-location representation for machine output.

### 2. Move Doctor Findings Onto Inventory

- [ ] Change forwarding/MCP findings to read code-surface facts from
      `inventory.forwarding` and `inventory.mcp`.
- [ ] Keep env key presence/quality checks local to doctor so secret values do
      not enter inventory.
- [ ] Remove now-unused scanner imports or local variables from doctor.
- [ ] Keep human doctor output unchanged.

### 3. Add Tests

- [ ] Test `doctor --json` includes `inventory.forwarding` and `inventory.mcp`.
- [ ] Test trusted-forwarding public exposure findings cite inventory source
      locations.
- [ ] Test destructive/custom MCP misuse findings are driven by inventory
      source locations.
- [ ] Test inventory JSON does not include raw source snippets with known secret
      or identity-like fixture values.
- [ ] Test generated `workspace-mcp` inventory reports expected forwarding/MCP
      shape.

### 4. Update Trackers

- [ ] Update this sprint plan with exit notes.
- [ ] Update Slice 8 only for items actually completed.
- [ ] Leave public-surface, upgrade, and explain replacement unchecked.

## Verification

Focused unit checks:

```bash
pnpm exec vitest run --project=unit tests/unit/cli-doctor.test.ts
```

Inventory-adjacent checks:

```bash
pnpm exec vitest run --project=unit \
  tests/unit/cli-doctor.test.ts \
  tests/unit/phase0-starter-manifest.test.ts \
  tests/unit/feature-compose.test.ts
```

Starter and surface checks:

```bash
pnpm run check:starter-fixtures
pnpm run check:docs:api-surface
pnpm run check:publish-surface
pnpm run check:refactor:surface:inventory
pnpm run check:cli
```

Formatting/diff checks:

```bash
git diff --check
pnpm exec oxfmt --check \
  src/cli/lib/inventory.ts \
  src/cli/commands/doctor.ts \
  tests/unit/cli-doctor.test.ts \
  meta/refactor/sprint32-inventory-backed-forwarding-doctor-plan.md
```

## Acceptance Criteria

- [ ] Inventory JSON has explicit forwarding/MCP sections.
- [ ] Forwarding/MCP source-code facts have one inventory source.
- [ ] Doctor forwarding/MCP findings read source-code facts from inventory.
- [ ] Env secret values remain outside inventory.
- [ ] Human doctor output remains stable.
- [ ] Tests prove forwarding/MCP inventory shape and secret safety.
- [ ] No broad new scanner duplicates an existing doctor scanner.
- [ ] Slice 8 tracker is updated.
- [ ] Sprint changes are committed after verification.

## Exit Notes

Pending.

## Next Sprint Candidate

After forwarding/MCP findings move onto inventory, the next likely Slice 8
sprint should handle unsafe/destructive backend inventory:

- unsafe entrypoints;
- cross-tenant escapes;
- destructive operation descriptors;
- source metadata suitable for doctor and future `explain`.
