# Team Starter

B2B SaaS baseline for products with organizations, memberships, invitations,
role checks, projects, and audit events.

## Includes

- users keyed by auth subject;
- organizations;
- active/suspended/removed memberships;
- owner/admin/member/viewer roles;
- invitation acceptance;
- project mutations protected by `requireOrgAccess`;
- audit events for product writes.

## Non-goals

- no agency/client delegation;
- no MCP;
- no agents;
- no ABAC, ReBAC, custom roles, or materialized permissions;
- no shared B2B package until another starter proves the same invariants.

## Commands

```bash
pnpm install
pnpm convex:dev
pnpm dev
pnpm test
pnpm typecheck
```

