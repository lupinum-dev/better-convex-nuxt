# Agency Portal Example

This is the agency and multi-client SaaS example.

It shows:

- current-workspace operations for client work
- agency-wide dashboard access across assigned clients
- explicit membership checks instead of hidden tenant bypasses

## Auth Shape

- users may belong to multiple workspaces through `memberships`
- current workspace is explicit on the user row
- agency roles and client roles coexist in the same membership model

## Easy Problem

- a normal client user can work inside their active client workspace

## Hard Problem

- agency users need controlled cross-tenant views, but only for assigned clients and without weakening the normal tenant boundary

## Module Primitives Used

- `guard`, `can`, `deny`
- configured `usePermissions()` / `useAuthGuard()`
- `createTestContext`

## Files To Read First

1. `convex/auth/agency.ts`
2. `convex/dashboard.ts`
3. `convex/projects.ts`
4. `pages/index.vue`
5. `convex/agency.test.ts`

## Run It

1. Copy `.env.example` to `.env.local`
2. `pnpm install`
3. `pnpm dev`

## Demo Flow

1. Sign up and create a client workspace.
2. Seed an agency portfolio.
3. Switch between workspaces.
4. Compare the current-workspace project view with the cross-client dashboard.

## Test Focus

- client users stay tenant-scoped
- agency users only see assigned clients
- duplicate joins do not create duplicate memberships
- unassigned clients stay out of the dashboard
