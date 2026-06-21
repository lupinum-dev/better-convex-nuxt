# Starter Implementation Status

Status: starter apps are implemented and locally verified.

## Implemented

- `public`: public todos app with no auth runtime, no organization files, and
  todo invariant tests.
- `team`: organization SaaS baseline with users, memberships, invitations,
  RBAC, projects, audit, and invariant tests.
- `agency`: agency/client workspace starter with explicit organization links,
  delegated project access, access-path audit, and invariant tests.
- `mcp-agent`: service actor starter with credential hashes, MCP-style
  `POST /mcp` route, project tools, approval-gated delete, and invariant tests.
- `vertical-ai`: Convex Agent starter where agent output creates drafts and
  reviewer approval promotes drafts to canonical records.

## Verified Locally

- `pnpm exec nuxi prepare` passes for all five starters.
- `pnpm typecheck` passes for all five starters.
- `pnpm test` passes for all five starters.
- `pnpm exec tsc -p convex/tsconfig.json --noEmit` passes for all five
  starters.
- `pnpm build` passes for all five starters.
- `public` explicitly disables `convex.auth` and builds without auth warnings.
- Auth-based starter builds were verified with placeholder Convex URL/site URL
  environment variables.

## Bootstrap Generated Files

The auth, B2B, MCP, and AI starters include tiny bootstrap files under
`convex/_generated` so `pnpm test`, `pnpm typecheck`, and Nuxt builds work
before a user configures a Convex deployment.

Those files deliberately use generic `any` exports. They are not the schema
source of truth. Running `pnpm convex:dev` or `pnpm convex:codegen` in a real
deployment should replace them with Convex's schema-derived generated files.

## Required For A Real App

For each starter:

1. Configure a real Convex deployment with `pnpm convex:dev`.
2. Commit or regenerate `convex/_generated`.
3. Run `pnpm typecheck`.
4. Run `pnpm test`.
5. Smoke the Nuxt app against the configured deployment.

Do not edit the bootstrap `_generated` files by hand for application behavior.
Domain state and invariants belong in `convex/schema.ts` and product modules.
