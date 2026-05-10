# Sprint 40: API Surface Docs Use Public Surface Helper

## Goal

Make the generated API surface docs consume the same repo public-surface helper
introduced in Sprint 39.

By the end of this sprint, both of these generated public-surface artifacts
should use `scripts/lib/public-surface-inventory.mjs` for package exports,
generated Nuxt aliases, auto-imports, server imports, and auth components:

- `meta/refactor/sprint1-public-surface-inventory.md`;
- `apps/docs/content/docs/13.api-reference/7.api-surface.md`.

This should remove duplicated collection logic from
`scripts/generate-api-surface.mjs` while keeping docs wording and output stable.

## Why This Sprint Comes Next

Sprint 39 moved the refactor public-surface generator onto
`collectRepoPublicSurfaceInventory(...)`, but `generate-api-surface.mjs` still
duplicates package export, installer, alias, and auth component scanning.

The Slice 8 goal is one inventory engine feeding docs generation where useful.
This sprint is the narrowest next step because:

- the helper already contains the facts the API docs need;
- the docs generator can stay pure Node and avoid CLI build-order coupling;
- no runtime code or public API changes are needed;
- generated output should remain stable if the helper is faithful.

## Current State

- `scripts/lib/public-surface-inventory.mjs` returns repo public-surface facts.
- `scripts/generate-refactor-surface-inventory.mjs` consumes that helper.
- `scripts/generate-api-surface.mjs` still reads `package.json`,
  `src/installers/*`, and `src/runtime/auth/ui/*` directly.
- `tests/unit/api-surface-doc.test.ts` checks the generated API surface doc.
- `tests/unit/public-surface-inventory-script.test.ts` checks helper facts.

## Non-Goals

- Do not change API surface docs content intentionally.
- Do not introduce a new generated artifact.
- Do not make docs generation depend on built CLI output.
- Do not import `src/cli/lib/inventory.ts`.
- Do not change package exports, auto-imports, aliases, or auth components.
- Do not broaden the helper into runtime API.

## Design Target

### API Generator Uses Helper

Update `scripts/generate-api-surface.mjs` to call:

```js
const inventory = collectRepoPublicSurfaceInventory(rootDir)
```

Then derive existing docs sections from:

- `inventory.packageExports`;
- `inventory.generatedNuxtSurface.autoImports`;
- `inventory.generatedNuxtSurface.serverImports`;
- `inventory.generatedNuxtSurface.aliases`;
- `inventory.generatedNuxtSurface.authComponents`.

Keep details maps and docs prose inside the docs generator. The helper owns
facts; the generator owns docs wording.

### Preserve Generated Output

Run:

```bash
pnpm run docs:api-surface
```

Expected outcome: the generated API surface page should remain unchanged. If it
changes, inspect whether the helper is exposing a real current-state difference
or just changing order. Prefer stable output over churn.

### Strengthen Tests

Extend or add tests so the helper/docs contract is visible:

- API surface docs include package subpaths from helper facts;
- core/auth/permissions auto-import sections still render;
- aliases still render;
- auth components still render;
- generated output remains snippet-free.

## Work Items

### 1. Reuse Helper In API Docs Generator

- [ ] Import `collectRepoPublicSurfaceInventory(...)`.
- [ ] Delete local package/installer/component scanners from
      `generate-api-surface.mjs`.
- [ ] Keep docs prose and details maps in `generate-api-surface.mjs`.
- [ ] Preserve section ordering and generated markdown output.

### 2. Regenerate And Check Docs

- [ ] Run `pnpm run docs:api-surface`.
- [ ] Confirm `apps/docs/content/docs/13.api-reference/7.api-surface.md` is
      unchanged or only changed for a real current-state correction.
- [ ] Run `pnpm run check:docs:api-surface`.

### 3. Add/Adjust Tests

- [ ] Extend API surface docs tests to cover a package subpath from helper facts.
- [ ] Ensure core/auth/permissions auto-import sections still contain expected
      rows.
- [ ] Ensure alias and auth component rows still contain expected rows.
- [ ] Ensure generated docs do not include source snippets.

### 4. Update Trackers

- [ ] Update this sprint plan with exit notes.
- [ ] Update Slice 8 notes.
- [ ] Keep `explain operation <id>` unchecked.
- [ ] Keep `Doctor reads inventory/finding engine` unchanged unless this sprint
      actually touches it.

## Verification

Focused docs/helper tests:

```bash
pnpm exec vitest run --project=unit \
  tests/unit/api-surface-doc.test.ts \
  tests/unit/public-surface-inventory-script.test.ts
```

Public surface checks:

```bash
pnpm run check:docs:api-surface
pnpm run check:refactor:surface:inventory
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
  scripts/generate-api-surface.mjs \
  tests/unit/api-surface-doc.test.ts \
  tests/unit/public-surface-inventory-script.test.ts \
  apps/docs/content/docs/13.api-reference/7.api-surface.md \
  meta/refactor/sprint40-api-surface-docs-helper-plan.md \
  meta/trellis-1.0-refactor-plan.md
```

## Acceptance Criteria

- [ ] `generate-api-surface.mjs` consumes
      `collectRepoPublicSurfaceInventory(...)`.
- [ ] Local duplicate scanners are removed from `generate-api-surface.mjs`.
- [ ] Generated API surface docs remain stable or only change for a documented
      current-state correction.
- [ ] API surface docs tests cover the helper-fed sections.
- [ ] Public-surface checks pass.
- [ ] Slice 8 tracker is updated.
- [ ] Sprint changes are committed after verification.

## Exit Notes

- pending

## Next Sprint Candidate

After both public-surface generated artifacts use the shared helper, the next
Slice 8 sprint should add source-location metadata to security findings so
doctor and upgrade can cite structured metadata origins consistently.
