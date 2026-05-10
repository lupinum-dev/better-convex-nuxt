# Sprint 77: Bridge Package-Author Guide

## Goal

Finish the Slice 12 bridge documentation rewrite by making the component bridge
guide clearly package-author material. Normal app authors should not see bridge
internals as part of the beginner path.

## Scope

- Rewrite `apps/docs/content/docs/07.server-side/5.component-bridge.md` around
  packaged integration authors.
- Teach `@lupinum/trellis-bridge` as the bridge-owned import and tooling
  boundary.
- Clarify role ownership:
  - packaged integration author owns the manifest and generated host file
    contract;
  - host app owns app policy, root handlers, and generated refs;
  - bridge tooling installs and checks generated host integration files;
  - Ginko is a reference bridge consumer, not Trellis release scope or beginner
    CMS setup.
- Make clear that normal app features should use root handlers, server helpers,
  operations, and MCP projection, not bridge internals.
- Make only narrow alignment edits to examples or index pages if they still make
  bridge look like a beginner starter.

## Non-Goals

- No runtime bridge package changes.
- No Ginko product setup changes.
- No bridge CLI redesign.
- No public API reference rewrite.
- No compatibility paths or old bridge import aliases.
- No changes to the signed-forwarding implementation.

## Actions

1. Baseline docs scan for bridge leakage:

   ```bash
   rg -n "bridge|component bridge|createComponentBridge|defineComponentBridgeManifest|@lupinum/trellis-bridge|@lupinum/trellis/bridge|trellis-bridge|cms starter|--template cms|Ginko|ginko|managedEdits|renderFiles" apps/docs/content/docs README.md examples -g '*.md'
   ```

2. Rewrite the component bridge guide as a package-author guide:
   - lead with who should read it;
   - explain who owns manifest, host generated files, root policy, and package
     docs;
   - show the bridge package import boundary;
   - explain install/check/drift workflow without making it a normal app setup
     step;
   - state that bridge forwarding authenticates transport only and backend
     handlers still authorize.

3. Align nearby docs only if needed:
   - example index labels for `08-component-mini-cms`;
   - README or getting-started wording around CMS/Ginko ownership.

4. Update `meta/trellis-1.0-refactor-plan.md`:
   - mark the bridge package-author guide complete only after implementation and
     verification pass;
   - leave Public API reference open.

## Verification

Run:

```bash
pnpm run check:docs:links
pnpm run check:docs:api-surface
pnpm run check:repo-policies
pnpm exec oxfmt --check apps/docs/content/docs/07.server-side/5.component-bridge.md apps/docs/content/docs/5.examples.md README.md meta/refactor/sprint77-bridge-package-author-guide-plan.md meta/trellis-1.0-refactor-plan.md
git diff --check
```

Repeat the baseline scan and confirm active docs do not teach old bridge imports,
CMS as a Trellis beginner starter, or bridge internals as normal app feature
architecture.

## Done Means

- The bridge docs are clearly for package authors and packaged integration
  maintainers.
- Normal app authors are directed to root handlers, server helpers, operations,
  and MCP projection.
- `@lupinum/trellis-bridge` is the only bridge package boundary taught.
- Ginko/CMS setup remains product-owned or advanced reference material, not a
  Trellis beginner starter.
- Slice 12 still has only the Public API reference rewrite open after this
  sprint.
