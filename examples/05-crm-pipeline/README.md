# CRM Pipeline Example

This is the CRM SaaS example.

It shows:

- row-level visibility with `defineVisibility()` and `applyVisibility()`
- field redaction applied after visibility filtering
- app-owned manager/team rules in `convex/auth/*`
- backend-owned permission context exposed to Nuxt through configured `usePermissions()`

## Auth Shape

- workspace membership
- roles: `owner`, `admin`, `manager`, `rep`
- reps only see their own contacts
- managers see their direct reports' contacts
- sensitive fields are redacted for lower-privilege roles

## Easy Problem

- a rep can create and update their own contact

## Hard Problem

- the same tenant can contain partially visible data, and read access is not the same as row visibility or field visibility

## Module Primitives Used

- `guard`, `can`
- `defineVisibility`, `applyVisibility`
- configured `usePermissions()` / `useAuthGuard()`
- `createTestContext`

## Files To Read First

1. `convex/auth/visibility.ts`
2. `convex/auth/redaction.ts`
3. `convex/contacts.ts`
4. `pages/index.vue`
5. `convex/crm.test.ts`

## Run It

1. Copy `.env.example` to `.env.local`
2. `pnpm install`
3. `pnpm dev`

## Demo Flow

1. Sign up and create a workspace.
2. Add a few contacts as the owner or a rep.
3. Sign in as a second user and join as `manager` or `rep`.
4. Compare which contacts each role can see and which fields are redacted.

## Test Focus

- own rows vs team rows
- manager override
- redacted fields staying hidden from reps
