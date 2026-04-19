# SaaS Platform Example

This is both the month-two example and the gallery's **project-management SaaS** example.
It is the cleanest role + ownership + business-state case in the repo, then extended into a
real product surface with plan-based entitlements and usage limits.

It adds:

- paginated project lists
- optimistic board updates
- file uploads on comments
- nested project -> task -> comment permissions
- explicit `loadResource()` helpers
- `guard` for business-state and secondary-document checks
- plan entitlements with `hasFeature()` checks
- count-based usage limits with `ensureWithinLimit()`
- `upgradePlan` mutation for workspace plan management
- feature-gated CSV export via `exportProjects`
- Nitro routes that call Convex
- first-class integration tests and browser E2E

Attachment note for this pass:

- upload preview is client-side before submit
- already-saved attachments are intentionally not reopened through a raw Convex storage lookup
- any future retrieval path should hang off the owning comment or task, not `_storage` directly

## Files To Read First

If this is your first pass, stop after the first three files. The rest are expansion surfaces, not
the core permission model.

1. `convex/auth/checks.ts`
2. `convex/domain/tasks.ts`
3. `pages/projects/[id].vue`
4. `pages/admin/index.vue`
5. `server/api/webhook.post.ts`
6. `convex/projectBoard.test.ts`

## What This Adds Beyond 03

Example 03 proves the tenant + permission + MCP safety model.

Example 04 keeps the same safety model, then shows the next layer of real product work:

- larger list handling with pagination
- cache-backed detail navigation
- optimistic interaction patterns
- uploads and attachments
- admin workflows and recent activity
- server-side integrations

In the SaaS gallery this example represents:

- SaaS type: project management
- easy problem: members updating their own work
- hard problem: nested resource guards plus business-state rules like archived projects

This example keeps the repo's canonical single-workspace contract:

- scoped tables use `workspaceId`
- tenant indexes use `by_workspace`
- ownership fields store the auth-subject string

The point of Example 04 is not a different naming scheme. It is the same workspace model from
Example 03 carried into a larger product surface.

The example now uses the same public canonical layout as the Trellis starters:

- `convex/domain/*` for the core business handlers
- `convex/permissions/context.ts` for the configured permission query
- `convex/operations/*` for destructive projections like project archive and task removal

## Run It

1. Copy `.env.example` to `.env.local`
2. `pnpm install`
3. `pnpm dev`

`pnpm dev` is the default path. It starts an anonymous local Convex deployment, waits for Convex codegen, and then starts Nuxt.
Use `pnpm convex:dev` only if you explicitly want to run the local backend by hand.

## Run The Tests

- Integration tests: `pnpm test`
- Browser E2E: `pnpm test:e2e`
- Both: `pnpm test:all`

## Demo Flow

1. Sign up as the workspace owner and create a workspace.
2. Create a project and open its board.
3. Add tasks, move one to another column, and open its detail view.
4. Upload an attachment on a comment.
5. Open the admin page and change another member from `member` to `viewer`.
6. Verify the member loses task-creation access live.

Convex files run on Convex's infrastructure, outside Nuxt's auto-import/build scope. That is why
the app owns tiny files like `convex/auth/actor.ts` and `convex/functions.ts`, even though the
protected handlers now use `query()` / `mutation()`, with `raw.query()` / `raw.mutation()` kept only for explicit escape hatches.
