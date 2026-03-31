# Doc Sharing Example

This is the collaboration and document-sharing SaaS example.

It shows:

- workspace roles plus per-document access
- inherited access through page trees
- token-based public access as a separate path

## Auth Shape

- workspace membership
- roles: `owner`, `admin`, `member`, `viewer`
- per-page access levels: `view`, `comment`, `edit`
- share tokens for public or semi-public links

## Easy Problem

- a workspace member can view a shared page

## Hard Problem

- page access can come from inheritance or from a token, and token level still has to be enforced independently

## Module Primitives Used

- `guard`, `can`, `deny`
- `createAuth` from `better-convex-nuxt/composables`
- `createTestContext`

## Files To Read First

1. `convex/auth/page-access.ts`
2. `convex/auth/share-tokens.ts`
3. `convex/pages.ts`
4. `pages/index.vue`
5. `convex/doc-sharing.test.ts`

## Run It

1. Copy `.env.example` to `.env.local`
2. `pnpm install`
3. `pnpm dev`

## Demo Flow

1. Sign up and create a workspace.
2. Seed demo pages.
3. Generate a share token for the root page.
4. View the page through the authenticated path and the token path.

## Test Focus

- workspace path
- expired/revoked token denial
- token level mismatch denial
- inherited access
