# Project Board + Admin Example

This is the month-two example: the app you build after auth, tenant scoping, and basic permissions are already in place.

It adds:

- paginated project lists
- optimistic board updates
- file uploads on comments
- nested project -> task -> comment permissions
- explicit `loadResource()` helpers
- `guard` for business-state and secondary-document checks
- Nitro routes that call Convex
- first-class integration tests and browser E2E

## Files To Read First

1. `convex/auth/checks.ts`
2. `convex/tasks.ts`
3. `pages/projects/[id].vue`
4. `pages/admin/index.vue`
5. `server/api/webhook.post.ts`
6. `convex/project-board.test.ts`

## What This Adds Beyond 03

Example 03 proves the tenant + permission + MCP safety model.

Example 04 keeps the same safety model, then shows the next layer of real product work:

- larger list handling with pagination
- cache-backed detail navigation
- optimistic interaction patterns
- uploads and attachments
- admin workflows and recent activity
- server-side integrations

This example intentionally uses `workspaceId` instead of Example 03's `organizationId` to make
the point that tenant naming is app-owned. The auth helpers stay the same; only your table and
field names change.

## Run It

1. `pnpm install`
2. `pnpm convex:codegen`
3. `pnpm convex:dev`
4. In another terminal: `pnpm dev`

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

Convex files run on Convex's infrastructure, outside Nuxt's auto-import/build scope. That is why the app owns tiny files like `convex/auth/actor.ts` and imports raw `query()` / `mutation()` directly instead of relying on framework builders.
