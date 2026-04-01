# E-Commerce Ops Example

This is the e-commerce back-office SaaS example.

It shows:

- human actors and service actors
- idempotent webhook handling
- refund-state guards that apply to both paths
- backend-owned permission context exposed to Nuxt through configured `usePermissions()`

## Auth Shape

- workspace membership
- roles: `owner`, `admin`, `support`, `viewer`
- service actor authenticated with `verifyServiceKey()` and an explicit `CONVEX_SERVICE_KEY`

## Easy Problem

- an admin can refund a valid fulfilled order

## Hard Problem

- duplicated or invalid webhook events must be denied, and the refund rules must stay consistent across human and machine callers

## Module Primitives Used

- `guard`, `can`, `deny`, `verifyServiceKey`
- configured `usePermissions()` / `useAuthGuard()`
- `createTestContext`

## Files To Read First

1. `convex/auth/service-auth.ts`
2. `convex/auth/idempotency.ts`
3. `convex/orders.ts`
4. `convex/webhooks.ts`
5. `convex/ecommerce.test.ts`

## Run It

1. Copy `.env.example` to `.env.local`
2. `pnpm install`
3. `pnpm dev`

Keep `CONVEX_SERVICE_KEY` in `.env.local`. The launcher injects the local Convex URLs automatically.

## Demo Flow

1. Sign up and create a workspace.
2. Seed demo orders.
3. Refund a fulfilled order as an admin.
4. Compare that with the service-auth webhook path in the test file.

## Test Focus

- invalid service key denied
- missing service-key config fails closed
- duplicate event denied
- refund-state guards for both human and service actors
