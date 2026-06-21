# Agency Starter

Starter for agencies that manage multiple client workspaces.

## Organization Ownership

This starter intentionally uses app-owned Convex `organizations` and
`memberships` tables so it can model agency/client delegation through explicit
`organizationLinks`.

It does not enable the Better Auth Organization plugin. If you enable Better
Auth Organization, remove independent org/member truth from this starter and
keep only domain records keyed by Better Auth organization ids plus any
derived projections that have trigger and rebuild tests.

## Includes

- agency and client organizations;
- memberships scoped to one organization;
- explicit agency-client links;
- delegated client project access;
- audit events that record `direct` or `delegated` access paths.

## Non-goals

- no nested tenants;
- no global agency superuser;
- no MCP;
- no agents;
- no shared B2B package yet.

## Commands

```bash
pnpm install
pnpm convex:dev
pnpm dev
pnpm test
pnpm typecheck
```
