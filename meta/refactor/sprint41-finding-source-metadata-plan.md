# Sprint 41: Finding Source Metadata

## Goal

Add structured source metadata to doctor and upgrade findings that already come
from inventory-backed facts.

By the end of this sprint, JSON consumers should be able to tell which
inventory path produced a security finding without parsing human-readable
messages.

## Why This Sprint Comes Next

Sprint 40 finished moving both public-surface generated artifacts onto the
shared repo public-surface helper. Slice 8 still has one important proof item
open:

```text
Security findings cite the metadata source they came from.
```

Today several doctor and upgrade findings already use inventory locations in
their messages, but that source is not structured. This sprint adds the missing
metadata without adding new scanners or changing finding semantics.

## Current State

- `DoctorFinding` has `id`, `category`, `title`, `status`, `message`, and
  `fixHint`.
- `FindingReport` is shared by doctor and upgrade and already has
  `schemaVersion: 1`.
- `TrellisCliInventory` contains safe file/line locations for forwarding, MCP,
  backend, app-inventory, and public-surface facts.
- Doctor embeds some inventory locations in human messages.
- Upgrade `--check` mixes inventory-backed findings with narrow local string
  detectors for old 1.0 hard-cut paths.
- JSON consumers cannot distinguish inventory-backed evidence from text-only
  messages.

## Non-Goals

- Do not change finding IDs, categories, statuses, or exit behavior.
- Do not add new repo scanners.
- Do not implement `trellis explain`.
- Do not make doctor or upgrade depend on source snippets.
- Do not log or emit secrets, raw envelopes, bearer tokens, raw principal or
  delegation payloads, confirmation payloads, or user data.
- Do not require every finding to have sources. Start with findings that already
  have inventory or local scan evidence.
- Do not redesign the inventory schema.

## Design Target

### Finding Sources

Extend the shared finding model with safe, structured source metadata:

```ts
export type FindingSourceKind = 'inventory' | 'project-scan'

export interface FindingSource {
  kind: FindingSourceKind
  inventoryPath?: string
  label?: string
  locations?: TrellisCliInventorySourceLocation[]
}

export interface DoctorFinding {
  id: string
  category: DoctorFindingCategory
  title: string
  status: DoctorFindingStatus
  message: string
  fixHint: string
  sources?: FindingSource[]
}
```

`inventoryPath` should name the inventory field that produced the finding, for
example:

```text
forwarding.publicExposures
mcp.destructiveToolMisuses
backend.unsafeEntrypoints
publicSurface.operations
```

`locations` should reuse existing inventory source locations. It must never
contain snippets or raw values.

### Doctor Findings To Annotate

Add source metadata to existing inventory-backed doctor findings:

- `app-inventory-source` from `inventory.appInventory`;
- `trusted-forwarding-key-public-exposure` from
  `inventory.forwarding.publicExposures`;
- `forwarded-principal-trusted-path` from
  `inventory.forwarding.forwardedPrincipalMisuses`;
- `unsafe-surface-inventory` from `inventory.backend.unsafeEntrypoints`;
- `cross-tenant-escape-inventory` from `inventory.backend.crossTenantEscapes`;
- `destructive-operation-inventory` from
  `inventory.backend.destructiveOperations`;
- `mcp-destructive-operation-binding` from
  `inventory.mcp.destructiveToolMisuses`;
- `mcp-custom-app-write-bypass` from `inventory.mcp.customAppWriteMisuses`;
- `operation-tool-agreement` from `inventory.publicSurface.operations` and
  `inventory.publicSurface.tools`.

### Upgrade Findings To Annotate

Add source metadata to migration findings where evidence already exists:

- inventory-backed raw forwarding findings from `inventory.forwarding`;
- inventory-backed MCP findings from `inventory.mcp`;
- inventory-backed unsafe findings from `inventory.backend`;
- narrow local migration string detectors as `kind: 'project-scan'` with safe
  file/line locations when available.

Do not expand the local detectors. They are only sources for current migration
warnings.

### Human Output

Keep human output stable unless a small source line is clearly useful. JSON is
the primary consumer for this sprint.

If human output changes, it should summarize source paths without duplicating
long location lists.

## Work Items

### 1. Extend Shared Finding Types

- [x] Add `FindingSource` and `FindingSourceKind`.
- [x] Add optional `sources?: FindingSource[]` to `DoctorFinding`.
- [x] Keep `FindingReport.schemaVersion` at `1` unless the output contract
      needs a breaking schema bump.
- [x] Ensure source metadata is safe to share.

### 2. Add Small Source Helpers

- [x] Add a helper for inventory sources, e.g.
      `findingInventorySource(path, locations)`.
- [x] Add a helper for local project-scan sources if upgrade needs it.
- [x] Keep helpers in the shared CLI finding layer, not in separate doctor and
      upgrade implementations.

### 3. Annotate Doctor Findings

- [x] Add inventory sources to the doctor findings listed above.
- [x] Reuse existing inventory arrays; do not add scanner reads.
- [x] Keep existing messages and fix hints stable where possible.

### 4. Annotate Upgrade Findings

- [x] Add inventory sources to inventory-backed upgrade findings.
- [x] Add project-scan sources to narrow hard-cut migration detectors when the
      detector already has file/line evidence.
- [x] Keep `upgrade --check` behavior and exit codes unchanged.

### 5. Test JSON And Secret Safety

- [x] Doctor JSON includes structured `sources` for at least one forwarding,
      backend, MCP, and public-surface finding.
- [x] Upgrade JSON includes structured `sources` for at least one
      inventory-backed finding and one local project-scan finding.
- [x] Tests assert source metadata contains paths/lines, not snippets or raw
      values.
- [x] Human output tests stay stable or are updated for intentionally minimal
      output changes.

### 6. Update Trackers

- [x] Update this sprint plan with exit notes.
- [x] Update Slice 8 sprint notes.
- [x] Mark `Security findings cite the metadata source they came from` complete
      only if doctor and upgrade JSON both expose structured sources for the
      covered security findings.

## Verification

Focused CLI tests:

```bash
pnpm exec vitest run --project=unit tests/unit/cli-doctor.test.ts
pnpm exec vitest run --project=unit tests/unit/cli-upgrade.test.ts
```

CLI, fixture, and public-surface regression:

```bash
pnpm run check:cli
pnpm run check:starter-fixtures
pnpm run check:docs:api-surface
pnpm run check:refactor:surface:inventory
pnpm run check:publish-surface
```

Formatting and diff checks:

```bash
git diff --check
pnpm exec oxfmt --check \
  src/cli/lib/findings.ts \
  src/cli/lib/output.ts \
  src/cli/commands/doctor.ts \
  src/cli/commands/upgrade.ts \
  tests/unit/cli-doctor.test.ts \
  tests/unit/cli-upgrade.test.ts \
  meta/refactor/sprint41-finding-source-metadata-plan.md \
  meta/trellis-1.0-refactor-plan.md
```

## Acceptance Criteria

- [x] `DoctorFinding` supports safe structured source metadata.
- [x] Inventory-backed doctor security findings include `sources`.
- [x] Upgrade migration findings include `sources` where evidence already
      exists.
- [x] JSON consumers no longer need to parse messages to find evidence
      locations for covered findings.
- [x] No source metadata contains snippets, raw envelopes, bearer tokens,
      identity payloads, confirmation payloads, or user data.
- [x] Finding semantics, exit behavior, and scanner coverage remain unchanged.
- [x] Slice 8 tracker is updated.
- [x] Sprint changes are committed after verification.

## Exit Notes

- Added `FindingSource` metadata to shared doctor/upgrade findings.
- Added `findingInventorySource(...)` and `findingProjectScanSource(...)` in
  the shared CLI finding layer.
- Annotated inventory-backed doctor findings for forwarding, backend unsafe
  surfaces, cross-tenant escapes, destructive operations, MCP misuse, app
  inventory, and operation/tool agreement.
- Annotated upgrade findings with inventory-backed sources and existing local
  project-scan evidence.
- Kept human output, finding semantics, exit behavior, and scanner coverage
  unchanged.
- Added JSON assertions that source metadata contains safe path/line evidence
  and does not expose raw forwarding or identity payload values.
