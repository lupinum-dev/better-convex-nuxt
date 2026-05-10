# Sprint 37: Upgrade Check Inventory Foundation

## Goal

Add the first `trellis upgrade --check` foundation as a read-only inventory
consumer.

By the end of this sprint, `trellis upgrade --check` should inspect the current
project through `collectTrellisCliInventory(...)` and print a migration audit for
the 1.0 hard-cut surfaces. It should not rewrite files, run codemods, or add a
compatibility layer.

This sprint is about proving that the inventory engine can support migration
guidance outside doctor. It is not the full migration tool.

## Why This Sprint Comes Next

Sprint 36 added `inventory.publicSurface` and used it for doctor operation/tool
agreement. Slice 8 still needs another consumer:

```text
Upgrade --check uses inventory.
```

The other candidate is to make public-surface checks reuse inventory
immediately. That path is worth doing, but the current public-surface scripts are
repo-generation scripts that run directly under Node. Forcing them to import CLI
TypeScript internals now would add build/order complexity before we need it.

`upgrade --check` is the smaller next proof:

- it lives in the CLI, where inventory already lives;
- it can reuse existing inspection and finding types;
- it gives adopters a concrete migration audit;
- it does not require adding a public API or keeping old paths alive.

## Current State

- `trellis doctor --json` already includes versioned, secret-safe inventory.
- Doctor findings are mostly inventory-backed, but doctor is still framed as
  setup health, not migration readiness.
- The 1.0 refactor plan names hard-cut surfaces:
  - `@lupinum/trellis/functions` -> `@lupinum/trellis/backend`;
  - `tool.fromOperation(...)` -> `mcp.tool.operation(...)`;
  - raw trusted-forwarding args -> `_trellisForwarding`;
  - root/core bridge exports -> `@lupinum/trellis-bridge`;
  - template-backed starters/add-ons -> fixture-backed paths.
- There is no `trellis upgrade --check` command yet.

## Non-Goals

- Do not implement codemods.
- Do not auto-edit files.
- Do not add aliases, shims, or dual public paths.
- Do not implement `trellis explain`.
- Do not move public-surface generation scripts in this sprint.
- Do not replace every doctor scanner.
- Do not make warnings depend on source snippets; locations only.
- Do not execute or import app source.

## Design Target

### CLI Shape

Add a top-level command:

```bash
trellis upgrade --check
```

Optional flags:

```bash
trellis upgrade --check --json
trellis upgrade --check --cwd ./apps/foo
```

Keep the command read-only. If `--check` is omitted, the command should fail
with a concise message that only check mode exists for now.

### Report Shape

Human output should be migration-oriented, for example:

```text
Trellis 1.0 upgrade check

fail  Raw trusted-forwarding fields are still present
warn  @lupinum/trellis/functions imports need migration
pass  No tool.fromOperation usages found
```

JSON output should be versioned and secret-safe:

```ts
type UpgradeCheckReport = {
  schemaVersion: 1
  cwd: string
  inventory: TrellisCliInventory
  findings: UpgradeFinding[]
  summary: { pass: number; warn: number; fail: number }
}
```

Use the existing `DoctorFinding` shape unless a smaller shared finding type is
clearly simpler. Do not create a second summary format if `summarizeFindings`
works.

### Initial Finding Set

Start with migration findings that can be backed by existing inventory or
simple existing inspection helpers:

- raw trusted-forwarding public exposure;
- forwarded principal/delegation public-arg misuse;
- destructive MCP tool misuse without operation binding;
- custom MCP app-write misuse;
- unsafe backend entrypoints that still need typed permits;
- root/core bridge dependency or source reference;
- `@lupinum/trellis/functions` imports;
- `tool.fromOperation(...)` usage;
- `workspace --mcp` or `cms` starter references if visible in project files.

Keep severity conservative:

- security-sensitive old paths: `fail`;
- import/docs/migration cleanup: `warn`;
- absent old path: `pass`.

## Work Items

### 1. Add Upgrade Command Shell

- [ ] Add `src/cli/commands/upgrade.ts`.
- [ ] Register `upgrade` in `src/cli/main.ts`.
- [ ] Support `--check`, `--json`, and `--cwd`.
- [ ] Refuse non-check execution with a clear message.
- [ ] Keep command output read-only.

### 2. Reuse Inventory

- [ ] Use `inspectProject(...)`, `collectTrellisCliInventoryFacts(...)`, and
      `collectTrellisCliInventory(...)`.
- [ ] Do not add a new repo scanner for facts already present in inventory.
- [ ] Add only narrowly scoped migration detectors for old paths that inventory
      does not yet expose.
- [ ] Store source locations as path + line only.

### 3. Add Upgrade Findings

- [ ] Add raw forwarding migration finding.
- [ ] Add `tool.fromOperation` migration finding.
- [ ] Add `@lupinum/trellis/functions` import migration finding.
- [ ] Add bridge root/core reference migration finding.
- [ ] Add MCP destructive/custom-tool migration findings using
      `inventory.mcp`.
- [ ] Add unsafe/typed-permit migration finding using `inventory.backend`.

### 4. Add Tests

- [ ] Test clean generated starter passes upgrade check.
- [ ] Test raw forwarding exposure fails or warns according to severity policy.
- [ ] Test `tool.fromOperation(...)` is reported with file/line.
- [ ] Test `@lupinum/trellis/functions` import is reported with file/line.
- [ ] Test JSON output includes schema version, inventory, findings, and summary.
- [ ] Test non-check mode exits non-zero and does not mutate files.

### 5. Update Trackers

- [ ] Update this sprint plan with exit notes.
- [ ] Update Slice 8 notes.
- [ ] Mark `Upgrade --check uses inventory` only if the command reads
      `TrellisCliInventory` and tests prove it.
- [ ] Leave public-surface check reuse unchecked.

## Verification

Focused CLI tests:

```bash
pnpm exec vitest run --project=unit tests/unit/cli-upgrade.test.ts
```

Regression CLI tests:

```bash
pnpm exec vitest run --project=unit tests/unit/cli-doctor.test.ts tests/unit/cli-upgrade.test.ts
pnpm run check:cli
```

Inventory and fixture checks:

```bash
pnpm run check:starter-fixtures
pnpm run check:refactor:surface:inventory
```

Surface checks:

```bash
pnpm run check:docs:api-surface
pnpm run check:publish-surface
```

Formatting/diff checks:

```bash
git diff --check
pnpm exec oxfmt --check \
  src/cli/main.ts \
  src/cli/commands/upgrade.ts \
  tests/unit/cli-upgrade.test.ts \
  meta/refactor/sprint37-upgrade-check-inventory-foundation-plan.md \
  meta/trellis-1.0-refactor-plan.md
```

## Acceptance Criteria

- [ ] `trellis upgrade --check` exists and is read-only.
- [ ] `trellis upgrade --check --json` emits versioned, secret-safe JSON.
- [ ] Upgrade findings are backed by `TrellisCliInventory` wherever inventory
      already has the facts.
- [ ] Old 1.0 hard-cut paths are reported with file/line locations.
- [ ] The command does not introduce compatibility aliases or codemods.
- [ ] Generated starters can run upgrade check cleanly.
- [ ] Slice 8 tracker is updated.
- [ ] Sprint changes are committed after verification.

## Exit Notes

- pending

## Next Sprint Candidate

After upgrade check becomes the second inventory consumer, the next Slice 8
sprint should either:

- move public-surface checks onto inventory-backed metadata where useful; or
- extract shared finding/report rendering so doctor and upgrade do not drift.
