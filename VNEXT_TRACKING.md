# Trellis vNext Tracking

> Status as of 2026-04-16.
>
> Short answer: Trellis is **partially vNext**, not fully vNext.
>
> The runtime cutover has started and the first `examples-next` app is real and working.
> The repo is **not** fully vNext yet because the long-form docs, agent naming/API shape, and several core runtime guarantees in [SPEC.vNext.md](/Users/matthias/Git/0_libs/WORK/trellis/SPEC.vNext.md) are still not implemented.

## 1. Current Reality

- [x] A separate vNext design document exists at [SPEC.vNext.md](/Users/matthias/Git/0_libs/WORK/trellis/SPEC.vNext.md).
- [x] `defineTrellis(...)` exists as the public backend runtime entrypoint.
- [x] `createApp` is removed from the public runtime surface.
- [x] The first real `examples-next` app exists at [examples-next/01-kanban-workspace](/Users/matthias/Git/0_libs/WORK/trellis/examples-next/01-kanban-workspace/README.md).
- [x] That first `examples-next` app boots and returns `HTTP 200`.
- [ ] The repo as a whole is fully aligned to the vNext product boundary.
- [ ] The docs as a whole describe the current runtime truth.
- [ ] The code implements all major runtime guarantees promised by `SPEC.vNext.md`.

## 2. Runtime API Cutover

### 2.1 Public runtime surface

- [x] `defineTrellis(...)` is exported from [src/runtime/functions/index.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/functions/index.ts).
- [x] `defineTrellis(...)` exposes direct protected builders instead of requiring a nested `app` object.
- [x] `defineTrellis(...)` exposes `query`.
- [x] `defineTrellis(...)` exposes `mutation`.
- [x] `defineTrellis(...)` exposes `publicQuery`.
- [x] `defineTrellis(...)` exposes `publicMutation`.
- [x] `defineTrellis(...)` forwards `internalQuery` when both internal builders are provided.
- [x] `defineTrellis(...)` forwards `internalMutation` when both internal builders are provided.
- [x] `defineTrellis(...)` exposes `raw.query` as the explicit escape hatch.
- [x] `defineTrellis(...)` exposes `raw.mutation` as the explicit escape hatch.
- [x] `defineTrellis(...)` still exposes `createComponentBridge`.
- [x] Public tests assert that the runtime does **not** expose `createApp`.
- [ ] The internal implementation has been fully cleaned up to stop building/storing an internal `app` object shape at all.
- [ ] The public runtime surface includes an `action` builder, as promised in `SPEC.vNext.md`.
- [ ] A decision has been made whether `publicQuery` / `publicMutation` remain permanent aliases or get simplified away later.
- [ ] A decision has been made whether `createComponentBridge` belongs on the core runtime surface or should move to an advanced tier.

### 2.2 Runtime tests

- [x] [test/unit/functions-index-exports.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/test/unit/functions-index-exports.test.ts) checks the export cutover.
- [x] [test/unit/functions-defineTrellis.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/test/unit/functions-defineTrellis.test.ts) covers direct builders and raw escape hatches.
- [x] [test/unit/functions-createFunctions.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/test/unit/functions-createFunctions.test.ts) was migrated to `defineTrellis`.
- [x] The core runtime/unit batch for the cutover passes.
- [ ] A broader repo-wide test run has been completed after the cutover.
- [ ] The internal harness experiment set has been audited for vNext relevance versus stale pre-vNext architecture.

## 3. Example Migration Status

### 3.1 First `examples-next` app

- [x] [examples-next/01-kanban-workspace/convex/functions.ts](/Users/matthias/Git/0_libs/WORK/trellis/examples-next/01-kanban-workspace/convex/functions.ts) uses `defineTrellis(...)`.
- [x] The app exports direct `query` / `mutation` builders.
- [x] The app uses `defineOperation(...)` + `previewOf(...)` for destructive preview flow.
- [x] The app typechecks in `convex/`.
- [x] The app typechecks in `shared/`.
- [x] The app boots with `pnpm dev`.
- [x] The app responds at `http://127.0.0.1:4121/`.
- [ ] The first `examples-next` app includes an MCP projection over one operation.
- [ ] The first `examples-next` app proves an agent-facing flow, not just browser/runtime flow.

### 3.2 Existing examples migrated to the new builder shape

- [x] [examples/01-public-todo/convex/todos.ts](/Users/matthias/Git/0_libs/WORK/trellis/examples/01-public-todo/convex/todos.ts) uses `defineTrellis(...)`.
- [x] [examples/02-auth-todo/convex/functions.ts](/Users/matthias/Git/0_libs/WORK/trellis/examples/02-auth-todo/convex/functions.ts) uses `defineTrellis(...)`.
- [x] [examples/03-team-workspace/convex/functions.ts](/Users/matthias/Git/0_libs/WORK/trellis/examples/03-team-workspace/convex/functions.ts) uses `defineTrellis(...)`.
- [x] [examples/04-saas-platform/convex/functions.ts](/Users/matthias/Git/0_libs/WORK/trellis/examples/04-saas-platform/convex/functions.ts) uses `defineTrellis(...)`.
- [x] [examples/05-visibility-access/convex/functions.ts](/Users/matthias/Git/0_libs/WORK/trellis/examples/05-visibility-access/convex/functions.ts) uses `defineTrellis(...)`.
- [x] [examples/06-multi-workspace/convex/functions.ts](/Users/matthias/Git/0_libs/WORK/trellis/examples/06-multi-workspace/convex/functions.ts) uses `defineTrellis(...)`.
- [x] [examples/07-mcp-reference/convex/functions.ts](/Users/matthias/Git/0_libs/WORK/trellis/examples/07-mcp-reference/convex/functions.ts) uses `defineTrellis(...)`.
- [x] [examples/08-component-mini-cms/convex/functions.ts](/Users/matthias/Git/0_libs/WORK/trellis/examples/08-component-mini-cms/convex/functions.ts) uses `defineTrellis(...)`.
- [x] [examples/08-component-mini-cms/convex/components/miniCms/functions.ts](/Users/matthias/Git/0_libs/WORK/trellis/examples/08-component-mini-cms/convex/components/miniCms/functions.ts) uses `defineTrellis(...)`.
- [x] [test/internal-harness/convex/functions.ts](/Users/matthias/Git/0_libs/WORK/trellis/test/internal-harness/convex/functions.ts) uses `defineTrellis(...)`.

### 3.3 Raw-vs-protected ambiguity cleaned up

- [x] Explicit raw access was restored in [examples/05-visibility-access/convex/articles.ts](/Users/matthias/Git/0_libs/WORK/trellis/examples/05-visibility-access/convex/articles.ts).
- [x] Explicit raw access was restored in [examples/06-multi-workspace/convex/workspaces.ts](/Users/matthias/Git/0_libs/WORK/trellis/examples/06-multi-workspace/convex/workspaces.ts).
- [x] Explicit raw access was restored in [examples/07-mcp-reference/convex/runbooks.ts](/Users/matthias/Git/0_libs/WORK/trellis/examples/07-mcp-reference/convex/runbooks.ts).
- [x] Explicit raw access was restored in [test/internal-harness/convex/functionsProbe.ts](/Users/matthias/Git/0_libs/WORK/trellis/test/internal-harness/convex/functionsProbe.ts).
- [x] Explicit raw access was restored in [test/internal-harness/convex/mcpKeys.ts](/Users/matthias/Git/0_libs/WORK/trellis/test/internal-harness/convex/mcpKeys.ts).
- [ ] A repo-wide rule exists and is enforced consistently for when `raw.*` is allowed versus disallowed.

### 3.4 Example validation

- [x] `examples/03-team-workspace` Convex typecheck passes after the cutover.
- [x] `examples/07-mcp-reference` Convex typecheck passes after the cutover.
- [x] `examples/08-component-mini-cms` Convex typecheck passes after the cutover.
- [ ] Every legacy example has been boot-smoked after the cutover.
- [ ] Every legacy example README has been updated to stop teaching the pre-vNext builder shape.

## 4. Principal / Actor / Tenancy Alignment

- [x] Principal typing was tightened in [examples/03-team-workspace/convex/auth/principal.ts](/Users/matthias/Git/0_libs/WORK/trellis/examples/03-team-workspace/convex/auth/principal.ts).
- [x] Principal typing was tightened in [examples/04-saas-platform/convex/auth/principal.ts](/Users/matthias/Git/0_libs/WORK/trellis/examples/04-saas-platform/convex/auth/principal.ts).
- [x] Principal typing was tightened in [examples/07-mcp-reference/convex/auth/principal.ts](/Users/matthias/Git/0_libs/WORK/trellis/examples/07-mcp-reference/convex/auth/principal.ts).
- [x] Tenant isolation is exercised in [examples-next/01-kanban-workspace/convex/functions.ts](/Users/matthias/Git/0_libs/WORK/trellis/examples-next/01-kanban-workspace/convex/functions.ts).
- [x] The first `examples-next` app proves app-owned user rows, actor resolution, and tenant-scoped tables.
- [ ] `ctx.db.crossTenant` exists in runtime code.
- [ ] `ctx.db.raw` exists in runtime code as a first-class explicit API.
- [ ] `ctx.runAsUser(...)` exists in runtime code.
- [ ] `ctx.runAsService(...)` exists in runtime code.
- [ ] Service actor scoping is runtime-enforced rather than advisory.
- [ ] Webhook/server/service entrypoints compile down to the same trust model as the rest of the runtime.

## 5. Operations and Destructive Work

- [x] `defineOperation(...)` exists in the runtime.
- [x] `previewOf(...)` exists in the runtime.
- [x] `defineOperation(...)` is used in [examples-next/01-kanban-workspace/convex/boards.ts](/Users/matthias/Git/0_libs/WORK/trellis/examples-next/01-kanban-workspace/convex/boards.ts).
- [x] `defineOperation(...)` is used in [examples/08-component-mini-cms/convex/components/miniCms/pages.ts](/Users/matthias/Git/0_libs/WORK/trellis/examples/08-component-mini-cms/convex/components/miniCms/pages.ts).
- [x] Component Mini CMS operation typing was fixed to work with the new runtime shape.
- [ ] A real public `tool.fromOperation(...)` API exists in the runtime.
- [ ] Destructive tool binding proves operation identity and execute-ref identity, not just operation kind.
- [ ] The no-manifest operation story has a fully settled implementation contract.
- [ ] The agent-facing destructive flow is proven in an `examples-next` app, not only in docs/older examples.

## 6. Agent Runtime Alignment

- [x] Trellis has a real MCP runtime in code today.
- [x] The current codebase has `defineMcpRuntime(...)`.
- [x] The current codebase has `projectTool(...)`.
- [x] `examples/07-mcp-reference` is still the deepest current MCP example.
- [ ] The codebase has the vNext names promised by `SPEC.vNext.md`: `defineMcpApp(...)`, `tool(...)`, and `tool.fromOperation(...)`.
- [ ] A clear decision has been made whether to rename `defineMcpRuntime(...)` / `projectTool(...)` or keep them and update the vNext spec accordingly.
- [ ] Agent support has been integrated into `examples-next/01-kanban-workspace`.
- [ ] Replay protection and audit are documented as runtime guarantees with implementation-level references.
- [ ] Agent capability gating is expressed in one canonical vNext example instead of only the older MCP reference app.

## 7. CLI / Tooling / Linting

- [x] [src/cli/lib/init.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/cli/lib/init.ts) now generates `defineTrellis(...)`.
- [x] [test/unit/cli-doctor.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/test/unit/cli-doctor.test.ts) was updated for the new runtime surface.
- [x] [test/unit/module-validation.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/test/unit/module-validation.test.ts) was updated for the new runtime surface.
- [x] [test/unit/eslint-plugin.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/test/unit/eslint-plugin.test.ts) was updated for the new runtime surface.
- [x] The ESLint messaging now prefers `query(...)` / `mutation(...)` over `raw.*`.
- [ ] The ESLint rule set has been audited for any remaining language that assumes nested `app.*`.
- [ ] Scaffolding exists for the full vNext portfolio, not only the first app.

## 8. Docs and Messaging

### 8.1 Top-level docs already updated

- [x] [README.md](/Users/matthias/Git/0_libs/WORK/trellis/README.md) partially reflects `defineTrellis(...)`.
- [x] [examples/README.md](/Users/matthias/Git/0_libs/WORK/trellis/examples/README.md) now mentions `defineTrellis(...)` for `01-public-todo`.
- [x] [examples/01-public-todo/README.md](/Users/matthias/Git/0_libs/WORK/trellis/examples/01-public-todo/README.md) now mentions `defineTrellis(...)`.
- [x] [examples/04-saas-platform/README.md](/Users/matthias/Git/0_libs/WORK/trellis/examples/04-saas-platform/README.md) no longer teaches `app.query()` / `app.mutation()` in that note.

### 8.2 Long-form docs still teaching the dead runtime surface

- [ ] [docs/content/docs/1.guide/3.how-it-works.md](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/1.guide/3.how-it-works.md)
- [ ] [docs/content/docs/1.guide/4.shared-schema-dx.md](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/1.guide/4.shared-schema-dx.md)
- [ ] [docs/content/docs/1.guide/6.common-patterns.md](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/1.guide/6.common-patterns.md)
- [ ] [docs/content/docs/1.guide/7.key-concepts.md](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/1.guide/7.key-concepts.md)
- [ ] [docs/content/docs/1.guide/8.multi-caller-architecture.md](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/1.guide/8.multi-caller-architecture.md)
- [ ] [docs/content/docs/1.guide/9.common-integration-mistakes.md](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/1.guide/9.common-integration-mistakes.md)
- [ ] [docs/content/docs/6.server-side/2.server-queries.md](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/6.server-side/2.server-queries.md)
- [ ] [docs/content/docs/6.server-side/5.private-bridge.md](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/6.server-side/5.private-bridge.md)
- [ ] [docs/content/docs/7.permissions/1.setup.md](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/7.permissions/1.setup.md)
- [ ] [docs/content/docs/7.permissions/4.saas-examples.md](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/7.permissions/4.saas-examples.md)
- [ ] [docs/content/docs/7.permissions/5.choose-your-auth-starter.md](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/7.permissions/5.choose-your-auth-starter.md)
- [ ] [docs/content/docs/7.permissions/6.personal-to-workspace.md](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/7.permissions/6.personal-to-workspace.md)
- [ ] [docs/content/docs/7.permissions/7.workspace-to-workspace-mcp.md](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/7.permissions/7.workspace-to-workspace-mcp.md)
- [ ] [docs/content/docs/7.permissions/9.overrides-and-advanced-patterns.md](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/7.permissions/9.overrides-and-advanced-patterns.md)
- [ ] [docs/content/docs/7.permissions/10.migration-to-create-app.md](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/7.permissions/10.migration-to-create-app.md)
- [ ] [docs/content/docs/12.api-reference/0.which-api.md](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/12.api-reference/0.which-api.md)
- [ ] [docs/content/docs/12.api-reference/8.auth-runtime.md](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/12.api-reference/8.auth-runtime.md)
- [ ] [docs/content/docs/12.api-reference/9.functions-runtime.md](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/12.api-reference/9.functions-runtime.md)
- [ ] [docs/content/docs/13.mcp-tools/2.shared-schema.md](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/13.mcp-tools/2.shared-schema.md)
- [ ] [docs/content/docs/13.mcp-tools/4.safety-and-confirmation.md](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/13.mcp-tools/4.safety-and-confirmation.md)

### 8.3 Doc tasks beyond string replacement

- [ ] Rewrite [docs/content/docs/7.permissions/10.migration-to-create-app.md](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/7.permissions/10.migration-to-create-app.md) into a real `defineTrellis` migration document or remove it.
- [ ] Rewrite the Functions API reference around `defineTrellis(...)`, not `createApp(...)`.
- [ ] Rewrite MCP docs to match the final chosen vNext naming, not a mixed vocabulary.
- [ ] Audit every code sample that still teaches `app.query(...)` / `app.mutation(...)`.

## 9. vNext Spec vs Code Gaps

- [x] The vNext spec says the framework should center on `defineTrellis(...)`.
- [x] The code now has `defineTrellis(...)`.
- [ ] The vNext spec says the core should include `action`, but the runtime does not expose it.
- [ ] The vNext spec says the core should include `ctx.db.crossTenant`, but code does not expose it.
- [ ] The vNext spec says the core should include `ctx.db.raw`, but code does not expose it as described there.
- [ ] The vNext spec says the core should include `ctx.runAsUser(...)`, but code does not expose it.
- [ ] The vNext spec says the core should include `ctx.runAsService(...)`, but code does not expose it.
- [ ] The vNext spec says the agent pillar should center on `defineMcpApp(...)`, but code still centers on `defineMcpRuntime(...)`.
- [ ] The vNext spec says agent tooling should center on `tool(...)` / `tool.fromOperation(...)`, but code still centers on `projectTool(...)`.
- [ ] The vNext spec assumes a runtime-enforced service-safety story that does not yet exist in code.

## 10. `examples-next` Portfolio Status

- [x] [examples-next/README.md](/Users/matthias/Git/0_libs/WORK/trellis/examples-next/README.md) defines the portfolio intent.
- [x] `01-kanban-workspace` exists and is implemented.
- [x] `02-product-issue-tracker` has a README placeholder.
- [x] `03-docs-wiki` has a README placeholder.
- [x] `04-community-courses` has a README placeholder.
- [x] `05-headless-cms-publishing` has a README placeholder.
- [x] `06-agency-client-ops` has a README placeholder.
- [x] `06-support-inbox-crm` has a README placeholder.
- [x] `07-commerce-backoffice` has a README placeholder.
- [x] `08-agent-operator-console` has a README placeholder.
- [ ] The portfolio numbering is clean and internally consistent.
- [ ] [examples-next/README.md](/Users/matthias/Git/0_libs/WORK/trellis/examples-next/README.md) matches the actual folder names exactly.
- [ ] `07-commerce-backoffice` vs `08-agent-operator-console` numbering is aligned with the README table.
- [ ] The duplicate `06-*` numbering is resolved.
- [ ] `02-product-issue-tracker` is implemented.
- [ ] `03-docs-wiki` is implemented.
- [ ] `04-community-courses` is implemented.
- [ ] `05-headless-cms-publishing` is implemented.
- [ ] `06-agency-client-ops` is implemented.
- [ ] `support-inbox-crm` is implemented.
- [ ] `commerce-backoffice` is implemented.
- [ ] `agent-operator-console` is implemented.

## 11. What Must Happen Before We Can Honestly Say “Trellis Is vNext”

- [ ] Finish the long-form docs sweep so the repo stops teaching `createApp(...)`.
- [ ] Resolve the agent naming/API gap: either implement `defineMcpApp(...)` / `tool(...)` / `tool.fromOperation(...)` or change the vNext spec to the runtime that actually exists.
- [ ] Implement or cut the unimplemented core runtime promises: `action`, `ctx.db.crossTenant`, `ctx.db.raw`, `ctx.runAsUser`, `ctx.runAsService`.
- [ ] Implement real destructive tool identity binding if operation-backed agent tools are part of the vNext promise.
- [ ] Add an agent-facing flow to at least one `examples-next` app.
- [ ] Resolve the `examples-next` numbering mismatch.
- [ ] Decide whether `SPEC.md` is legacy, transitional, or still the source of truth, and label it honestly.

## 12. Recommended Work Order

- [ ] Step 1: finish the docs/runtime naming cutover for `defineTrellis(...)`.
- [ ] Step 2: decide the real vNext agent API and stop keeping spec and code in different dialects.
- [ ] Step 3: implement the missing trust-boundary primitives that the vNext spec currently promises.
- [ ] Step 4: add agent projection to `examples-next/01-kanban-workspace`.
- [ ] Step 5: build `examples-next/06-agency-client-ops` as the next serious pressure test.
