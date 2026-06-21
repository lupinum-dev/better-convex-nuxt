# Team Starter

B2B SaaS baseline for products with organizations, memberships, invitations,
role checks, projects, and audit events.

## Organization Ownership

This starter intentionally uses app-owned Convex `organizations`, `memberships`,
and `invitations` tables. It does not enable the Better Auth Organization
plugin.

Choose this starter when product-specific membership and role rules are the
main domain model. If you enable Better Auth Organization, remove these
app-owned org/member/invitation tables and use Better Auth as the canonical
source for memberships, invitations, and organization roles.

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
