# Freemium Workspace Example

This is the freemium B2B SaaS example.

It shows:

- plan-based feature flags
- explicit count-based limit guards
- backend-owned permission context exposing both `plan` and current usage

## Auth Shape

- workspace membership
- roles: `owner`, `admin`, `member`
- plan: `free`, `pro`, `enterprise`

## Easy Problem

- the UI can see whether exports are enabled on the current plan

## Hard Problem

- static permissions are not enough for count-based limits, so project creation still requires a database-backed guard

## Module Primitives Used

- `guard`, `can`, `deny`
- `createAuth` from `better-convex-nuxt/composables`
- `createTestContext`

## Files To Read First

1. `convex/auth/checks.ts`
2. `convex/auth/limits.ts`
3. `convex/workspaces.ts`
4. `convex/projects.ts`
5. `convex/freemium.test.ts`

## Demo Flow

1. Sign up and create a free workspace.
2. Add projects until the limit is reached.
3. Upgrade the workspace to `pro`.
4. Add more projects and compare the permission context before and after.

## Test Focus

- feature flag exposure in permission context
- feature-gated export denial on free
- free-tier limit denial
- upgraded plan passing the same mutation
