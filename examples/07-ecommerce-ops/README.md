# E-Commerce Ops Example

This is the e-commerce back-office SaaS example.

It shows:

- human actors and service actors
- idempotent webhook handling
- refund-state guards that apply to both paths
- backend-owned permission context via `createAuth()`

## Auth Shape

- workspace membership
- roles: `owner`, `admin`, `support`, `viewer`
- service actor authenticated with `verifyKey()`

## Easy Problem

- an admin can refund a valid fulfilled order

## Hard Problem

- duplicated or invalid webhook events must be denied, and the refund rules must stay consistent across human and machine callers

## Module Primitives Used

- `guard`, `can`, `deny`, `verifyKey`
- `createAuth`
- `createTestContext`

## Files To Read First

1. `convex/auth/service-auth.ts`
2. `convex/auth/idempotency.ts`
3. `convex/orders.ts`
4. `convex/webhooks.ts`
5. `convex/ecommerce.test.ts`

## Demo Flow

1. Sign up and create a workspace.
2. Seed demo orders.
3. Refund a fulfilled order as an admin.
4. Compare that with the service-auth webhook path in the test file.

## Test Focus

- invalid service key denied
- duplicate event denied
- refund-state guards for both human and service actors
