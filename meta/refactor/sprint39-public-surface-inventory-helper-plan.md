# Sprint 39: Public Surface Inventory Helper

## Goal

Move the repo public-surface planning check one step closer to the shared
inventory model without making Node scripts depend on built CLI TypeScript.

By the end of this sprint, the generated refactor public-surface inventory
should use a small shared helper for package exports, runtime barrels, generated
Nuxt surfaces, CLI commands, starter templates, and stale-doc token matches.
The CLI inventory can keep using `collectTrellisCliInventory(...)`; this sprint
should only remove duplication where it is cheap and clear.

This is a cleanup/proof sprint, not a broad rewrite of docs API generation.

## Why This Sprint Comes Next

Sprint 36 added `inventory.publicSurface` from the operation/tool extractor.
Sprint 37 added `upgrade --check` as a second inventory consumer. Sprint 38 made
doctor and upgrade share report rendering.

The next Slice 8 item is:

```text
Public surface checks reuse inventory where useful.
```

The current public-surface planning script,
`scripts/generate-refactor-surface-inventory.mjs`, owns useful repo-level
metadata, but it is a standalone Node script with several local scanners. The
runtime CLI inventory is TypeScript and app-project oriented. Forcing the script
to import built CLI internals would create build-order coupling and would not be
the simplest correct step.

The smaller useful step is to extract the repo public-surface metadata gathering
into one shared script helper, then let the generated check consume that helper.
That gives this surface one local source of truth without changing build order.

## Current State

- `scripts/generate-refactor-surface-inventory.mjs` directly scans:
  - `package.json` exports;
  - `src/runtime/**/index.ts` barrels;
  - Nuxt auto-imports and aliases from installers;
  - auth UI components;
  - CLI commands;
  - init templates;
  - old docs/token references.
- `scripts/generate-api-surface.mjs` separately scans package exports,
  installer auto-imports, aliases, and auth UI components for the docs API page.
- CLI inventory now has `inventory.publicSurface`, but that section is
  app-project operation/tool metadata, not repo public API metadata.
- There is no small reusable helper for repo public-surface facts.

## Non-Goals

- Do not make scripts import `src/cli/lib/inventory.ts`.
- Do not require `pnpm run build:cli` before public-surface checks.
- Do not rewrite the docs API-surface generator in the same sprint.
- Do not change public-surface decisions.
- Do not add a new generated artifact.
- Do not execute app source.
- Do not introduce a second generated snapshot.

## Design Target

### Shared Script Helper

Add a small helper under `scripts/lib/`, for example:

```js
scripts / lib / public - surface - inventory.mjs
```

It should export functions such as:

```js
collectRepoPublicSurfaceInventory(rootDir)
```

The returned shape should be plain JSON-friendly data:

```ts
{
  packageExports: string[]
  runtimeBarrels: string[]
  generatedNuxtSurface: {
    aliases: string[]
    autoImports: Array<{ layer: string; name: string }>
    serverImports: string[]
    authComponents: string[]
  }
  cli: {
    commands: string[]
    initTemplates: string[]
  }
  staleReferences: {
    docsMatches: Array<{ file: string; matches: string[] }>
    docsFrontDoorMatches: Array<{ file: string; matches: string[] }>
  }
}
```

Keep helper names boring and script-local. This is not a runtime API.

### Refactor Surface Generator Uses Helper

Update `generate-refactor-surface-inventory.mjs` to consume the helper instead
of owning all collection logic inline.

The generated markdown should remain semantically the same except for expected
formatting/order changes from the helper. If content changes, it should be
because the helper faithfully reports current repo state, not because decisions
changed.

### Tests

Add focused unit coverage for the helper if the current test setup can import
MJS script helpers cleanly. Otherwise add a script-level regression test that
runs the helper and asserts the key surfaces:

- `@lupinum/trellis/backend` is present;
- `trellis doctor` and `trellis upgrade` are present;
- `workspace-mcp` is present;
- deleted `cms` starter is absent;
- docs stale-reference rows are still produced.

## Work Items

### 1. Extract Helper

- [ ] Add `scripts/lib/public-surface-inventory.mjs`.
- [ ] Move walking, call-block extraction, alias extraction, CLI command
      extraction, template extraction, and stale-reference collection into the
      helper.
- [ ] Keep the helper pure and root-dir based.
- [ ] Keep the helper JSON-friendly and secret-free.

### 2. Use Helper In Refactor Surface Generator

- [ ] Replace inline collector code in
      `scripts/generate-refactor-surface-inventory.mjs`.
- [ ] Keep decision mapping and markdown rendering in the generator.
- [ ] Regenerate `meta/refactor/sprint1-public-surface-inventory.md`.
- [ ] Keep generated output stable unless the helper reveals a real current
      state difference.

### 3. Add Regression Coverage

- [ ] Add a focused test or script check for the helper.
- [ ] Assert package export, CLI command, starter, and stale-reference facts.
- [ ] Ensure helper output does not contain file contents or source snippets.

### 4. Update Trackers

- [ ] Update this sprint plan with exit notes.
- [ ] Update Slice 8 notes.
- [ ] Mark `Public surface checks reuse inventory where useful` only if the
      generator now consumes the shared helper and tests prove it.
- [ ] Leave `explain operation <id>` unchecked.

## Verification

Focused script/helper test:

```bash
pnpm exec vitest run --project=unit tests/unit/public-surface-inventory-script.test.ts
```

Public surface checks:

```bash
pnpm run check:refactor:surface:inventory
pnpm run check:docs:api-surface
pnpm run check:publish-surface
```

CLI and fixture regression:

```bash
pnpm run check:cli
pnpm run check:starter-fixtures
```

Formatting/diff checks:

```bash
git diff --check
pnpm exec oxfmt --check \
  scripts/lib/public-surface-inventory.mjs \
  scripts/generate-refactor-surface-inventory.mjs \
  tests/unit/public-surface-inventory-script.test.ts \
  meta/refactor/sprint1-public-surface-inventory.md \
  meta/refactor/sprint39-public-surface-inventory-helper-plan.md \
  meta/trellis-1.0-refactor-plan.md
```

## Acceptance Criteria

- [ ] Refactor public-surface generator uses one shared public-surface inventory
      helper.
- [ ] Helper output is JSON-friendly and secret/snippet-free.
- [ ] Existing public-surface decisions stay in the generator, not hidden in the
      helper.
- [ ] Generated `sprint1-public-surface-inventory.md` is current.
- [ ] Script/helper regression coverage exists.
- [ ] Public-surface checks still pass.
- [ ] Slice 8 tracker is updated.
- [ ] Sprint changes are committed after verification.

## Exit Notes

- pending

## Next Sprint Candidate

After the refactor public-surface generator uses a shared helper, the next Slice
8 sprint can either:

- reuse the same helper in `generate-api-surface.mjs`; or
- add source-location metadata to security findings so doctor and upgrade can
  cite structured metadata origins consistently.
