# Sprint 72: Starter Guide Ladder 1.0 Rewrite

## Summary

Continue Slice 12 by making the four official starter paths read like one
progressive Trellis 1.0 ladder:

- `public`
- `personal`
- `workspace`
- `workspace-mcp`

Sprint 71 fixed the docs front door. This sprint should make the linked starter
guides line up with that front door so a new reader can move from "which starter
do I pick?" into the right next guide without seeing old Trellis shape, bridge
language, or hand-built setup that fights the fixture-backed starter model.

## Why This Sprint

The code has one starter source of truth: fixture-backed `trellis init`. The
docs still need to make that product ladder obvious. If the starter guides feel
like separate hand-written tutorials, users will copy setup fragments instead of
starting from the maintained fixture shape.

This sprint should tighten the path, not add another abstraction.

## Non-Goals

- Do not rewrite every auth, permission, or MCP guide.
- Do not change starter implementation or CLI behavior.
- Do not add new starter names.
- Do not reintroduce `cms`, `workspace --mcp`, `.tpl`, raw forwarding, or bridge
  setup into beginner docs.
- Do not turn package-author bridge docs into beginner setup.
- Do not edit examples unless a guide points at a broken or stale example.

## Action Plan

### 1. Establish The Starter Docs Baseline

- [ ] Read and classify the current starter-ladder docs:
      `first-live-query`, `build-a-signed-in-todo-app`, `canonical-app-layout`,
      `permissions/setup`, `mcp-tools/getting-started`, and examples index.
- [ ] Run a focused starter docs scan:

  ```bash
  rg -n "public|personal|workspace|workspace-mcp|cms|Ginko|bridge|workspace --mcp|\\.tpl|template" apps/docs/content/docs/01.getting-started apps/docs/content/docs/08.permissions/1.setup.md apps/docs/content/docs/14.mcp-tools/1.getting-started.md apps/docs/content/docs/5.examples.md examples/README.md -g '*.md'
  ```

- [ ] Classify hits as canonical starter ladder, advanced bridge material,
      stale beginner bridge/CMS wording, or false positive.
- [ ] Record the baseline in this plan before editing.

### 2. Public Starter Guide

- [ ] Update `apps/docs/content/docs/01.getting-started/3.first-live-query.md`
      only if it does not clearly map to the `public` starter.
- [ ] Ensure the guide says: use `--template public` when you want the generated
      path, then keep the explicit `query.public` / `mutation.public` shape.
- [ ] Keep the hand-built walkthrough only as a learning path, not as a second
      starter source of truth.
- [ ] Verify no auth/workspace/MCP concepts leak into the public starter path.

### 3. Personal Starter Guide

- [ ] Update
      `apps/docs/content/docs/01.getting-started/4.build-a-signed-in-todo-app.md`
      only if it does not clearly map to the `personal` starter.
- [ ] Ensure the guide says: `personal` is signed-in user scope without tenant
      isolation or workspace roles.
- [ ] Ensure protected lanes use `query.protected` / `mutation.protected`.
- [ ] Keep workspace escalation as a next step, not mixed into the personal
      starter.

### 4. Workspace Starter Guide

- [ ] Update `apps/docs/content/docs/08.permissions/1.setup.md` only where it
      teaches workspace setup without anchoring to the `workspace` starter.
- [ ] Ensure the guide says: `workspace` introduces actor resolution, tenant
      isolation, roles/guards, and permission projection.
- [ ] Ensure the principal -> actor -> guard/load/authorize -> handler model is
      preserved.
- [ ] Avoid copying MCP or bridge setup into this guide.

### 5. Workspace MCP Starter Guide

- [ ] Update `apps/docs/content/docs/14.mcp-tools/1.getting-started.md` only
      where it does not clearly map to the `workspace-mcp` starter.
- [ ] Ensure the guide says: `workspace-mcp` starts from the workspace baseline
      plus MCP projection.
- [ ] Ensure the first MCP path is a read tool, then bounded writes, then
      operation-backed destructive tools.
- [ ] Ensure destructive MCP references `tool.operation(...)` only.
- [ ] Ensure signed forwarding is not described as authorization.

### 6. Remove Beginner Bridge Leakage If Found

- [ ] Check first-reader starter paths for package-author bridge concepts.
- [ ] Keep `component-bridge` docs linked only as advanced/package-author
      material.
- [ ] If starter pages currently send beginners to bridge setup, replace that
      path with Ginko-owned or advanced package-integration wording.
- [ ] Do not delete the advanced bridge docs in this sprint unless they are
      linked from the starter ladder as beginner setup.

### 7. Verify

- [ ] `pnpm run check:docs:links`
- [ ] `pnpm run check:docs:api-surface`
- [ ] `pnpm run check:repo-policies`
- [ ] Focused starter docs scan from step 1 returns only intentional starter
      ladder or advanced bridge hits.
- [ ] `pnpm exec oxfmt --check apps/docs/content/docs/01.getting-started apps/docs/content/docs/08.permissions/1.setup.md apps/docs/content/docs/14.mcp-tools/1.getting-started.md apps/docs/content/docs/5.examples.md examples/README.md meta/refactor/sprint72-starter-guide-ladder-plan.md meta/trellis-1.0-refactor-plan.md`
- [ ] `git diff --check`

### 8. Update The Refactor Tracker

- [ ] Add a Sprint 72 completion note to
      `meta/trellis-1.0-refactor-plan.md`.
- [ ] Mark Public/Personal/Workspace/Workspace MCP starter guide items complete
      only for paths actually edited or proven current.
- [ ] Mark "Delete beginner bridge references" complete only if the focused scan
      proves bridge references are advanced-only.
- [ ] Leave backend builder, operations, MCP projection, trusted forwarding,
      bridge package-author, and full API reference items open unless this
      sprint edits and verifies those guides directly.

## Done Means

- The starter guide ladder matches the official 1.0 starter surface.
- The four starter paths are progressive: public -> personal -> workspace ->
  workspace-MCP.
- Beginner docs do not teach bridge/package-author concepts as normal app setup.
- The tracker separates starter-guide completion from the deeper docs rewrite.
