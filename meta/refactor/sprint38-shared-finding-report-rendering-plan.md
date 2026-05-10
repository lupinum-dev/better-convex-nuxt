# Sprint 38: Shared Finding Report Rendering

## Goal

Remove the first drift point between `doctor` and `upgrade --check` by sharing
the finding report types and renderer.

By the end of this sprint, doctor and upgrade should both render through one
small report-output path for:

- JSON writing;
- summary formatting;
- finding line rendering;
- exit-code behavior based on failures.

This sprint should not change what doctor or upgrade checks. It is a cleanup
sprint that keeps the second inventory consumer from becoming a parallel CLI
implementation.

## Why This Sprint Comes Next

Sprint 37 added `trellis upgrade --check`, giving inventory a second real CLI
consumer. That immediately created a small duplication:

- `src/cli/lib/output.ts` renders doctor findings;
- `src/cli/commands/upgrade.ts` renders upgrade findings inline;
- both use `DoctorFinding` and `summarizeFindings`;
- both choose exit code from `summary.fail`.

Before adding public-surface reuse or `explain`, the finding/report mechanics
should have one owner. Otherwise every new inventory consumer will copy another
slightly different report shape.

## Current State

- `DoctorFinding`, `DoctorSummary`, and `summarizeFindings(...)` live in
  `src/cli/lib/findings.ts`.
- `DoctorReport` is also in `findings.ts`, but it is named specifically for
  doctor even though upgrade now has the same shape plus `schemaVersion`.
- `renderDoctorReport(...)` handles grouped doctor output and JSON.
- `upgrade.ts` has its own `UpgradeCheckReport` and inline
  `renderUpgradeCheckReport(...)`.
- Upgrade JSON is versioned at the top level; doctor JSON currently relies on
  `inventory.schemaVersion`.

## Non-Goals

- Do not change doctor findings.
- Do not change upgrade findings.
- Do not add codemods or migration execution.
- Do not implement `trellis explain`.
- Do not make public-surface scripts import CLI internals.
- Do not introduce a generic framework abstraction beyond the two existing CLI
  consumers.
- Do not change human output substantially unless tests require a stable
  smaller shape.

## Design Target

### Shared Report Shape

Add a neutral report type in `src/cli/lib/findings.ts`, for example:

```ts
export interface FindingReport {
  schemaVersion?: 1
  cwd: string
  inventory: TrellisCliInventory
  findings: DoctorFinding[]
  summary: DoctorSummary
}
```

Keep `DoctorReport` and `UpgradeCheckReport` as aliases or narrow interfaces
only if that makes call sites clearer. Do not create two incompatible report
formats.

### Shared Renderer

Replace command-local rendering with one helper, likely in
`src/cli/lib/output.ts`:

```ts
renderFindingReport(report, {
  json,
  color,
  title,
  targetLabel,
  groupByCategory,
})
```

Doctor can keep grouped category output. Upgrade can use flat output. The
important part is that JSON writing, finding rendering, summary formatting, and
status labels come from one place.

### Shared Exit Helper

Add a tiny helper if useful:

```ts
exitCodeForFindings(report.summary)
```

Keep it boring. Failure count greater than zero means exit code `1`, otherwise
`0`.

## Work Items

### 1. Generalize Report Types

- [ ] Add a neutral `FindingReport` type.
- [ ] Keep `DoctorReport` compatible with existing tests.
- [ ] Keep `UpgradeCheckReport` versioned and compatible with existing tests.
- [ ] Avoid a second summary or finding type.

### 2. Share Rendering

- [ ] Move flat finding rendering out of `upgrade.ts`.
- [ ] Keep doctor rendering behavior stable.
- [ ] Render upgrade check through the shared output helper.
- [ ] Keep JSON output exactly machine-readable and secret-safe.

### 3. Share Exit Logic

- [ ] Add or reuse one helper for failure-based exit codes.
- [ ] Use it from doctor.
- [ ] Use it from upgrade.

### 4. Add/Adjust Tests

- [ ] Test doctor JSON still contains inventory and findings.
- [ ] Test doctor human output still renders grouped checks.
- [ ] Test upgrade JSON still has top-level `schemaVersion: 1`.
- [ ] Test upgrade human output still renders the migration title and summary.
- [ ] Test doctor and upgrade both exit non-zero only when failures exist.

### 5. Update Trackers

- [ ] Update this sprint plan with exit notes.
- [ ] Update Slice 8 notes.
- [ ] Do not mark public-surface check reuse or `explain` work complete.

## Verification

Focused CLI tests:

```bash
pnpm exec vitest run --project=unit tests/unit/cli-doctor.test.ts tests/unit/cli-upgrade.test.ts
```

CLI build check:

```bash
pnpm run check:cli
```

Surface and fixture checks:

```bash
pnpm run check:starter-fixtures
pnpm run check:refactor:surface:inventory
pnpm run check:docs:api-surface
pnpm run check:publish-surface
```

Formatting/diff checks:

```bash
git diff --check
pnpm exec oxfmt --check \
  src/cli/lib/findings.ts \
  src/cli/lib/output.ts \
  src/cli/commands/doctor.ts \
  src/cli/commands/upgrade.ts \
  tests/unit/cli-doctor.test.ts \
  tests/unit/cli-upgrade.test.ts \
  meta/refactor/sprint38-shared-finding-report-rendering-plan.md \
  meta/trellis-1.0-refactor-plan.md
```

## Acceptance Criteria

- [ ] Doctor and upgrade share one finding report rendering path.
- [ ] Doctor and upgrade share one failure-based exit-code helper or equivalent.
- [ ] Existing doctor output expectations remain stable.
- [ ] Existing upgrade output expectations remain stable.
- [ ] No check semantics change.
- [ ] No new compatibility path is introduced.
- [ ] Slice 8 tracker is updated.
- [ ] Sprint changes are committed after verification.

## Exit Notes

- pending

## Next Sprint Candidate

After finding/report rendering is shared, the next Slice 8 sprint should move
public-surface checks onto inventory-backed metadata where useful. That is the
next reasonable consumer once the report mechanics no longer drift.
