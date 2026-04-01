# E-Commerce Ops Example

This is the e-commerce back-office SaaS example.

It shows:

- human actors and webhook bot users
- idempotent webhook handling
- refund-state guards that apply to both paths
- backend-owned permission context exposed to Nuxt through configured `usePermissions()`

## Auth Shape

- workspace membership
- roles: `owner`, `admin`, `support`, `viewer`
- trusted webhook callers authenticated with `verifyTrustedCallerKey()` and an explicit `CONVEX_TRUSTED_CALLER_KEY`

## Easy Problem

- an admin can refund a valid fulfilled order

## Hard Problem

- duplicated or invalid webhook events must be denied, and the refund rules must stay consistent across human and webhook bot users

## Module Primitives Used

- `guard`, `can`, `deny`, `verifyTrustedCallerKey`
- configured `usePermissions()` / `useAuthGuard()`
- `createTestContext`

## Files To Read First

1. `convex/auth/trustedCaller.ts`
2. `convex/auth/idempotency.ts`
3. `convex/orders.ts`
4. `convex/webhooks.ts`
5. `convex/ecommerce.test.ts`

## Run It

1. Copy `.env.example` to `.env.local`
2. `pnpm install`
3. `pnpm dev`

Keep `CONVEX_TRUSTED_CALLER_KEY` in `.env.local`. The launcher injects the local Convex URLs automatically.

## Demo Flow

1. Sign up and create a workspace.
2. Seed demo orders.
3. Refund a fulfilled order as an admin.
4. Compare that with the webhook bot path in the test file.

## Test Focus

- invalid trusted caller key denied
- missing trusted-caller config fails closed
- duplicate event denied
- refund-state guards for both human and webhook bot users
