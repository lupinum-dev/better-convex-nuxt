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
- audit events that record delegated project creation and link revocation with
  `direct` or `delegated` access paths;
- Better Auth email/password endpoints registered through Convex HTTP Actions.
- Better Auth create/update triggers for app-owned user actors, with a bounded
  projection rebuild operation.

## Non-goals

- no nested tenants;
- no global agency superuser;
- no MCP;
- no agents;
- no shared B2B package yet.

Active links are operator-approved canonical grants. This starter deliberately
ships no public self-link operation: establish a link only through an
application ceremony that proves authorization from both tenant sides.

## Commands

```bash
pnpm install
pnpm convex:dev
pnpm dev
pnpm test
pnpm typecheck
```

Set the auth origin and secret in Convex before starting the auth routes:

```bash
pnpm exec convex env set SITE_URL http://localhost:3000
pnpm exec convex env set BETTER_AUTH_SECRETS "0:$(openssl rand -base64 32)"
```

`SITE_URL` must be the exact public Nuxt origin, without a path, query, or
fragment. Production startup fails closed when either value is missing.

Better Auth is the identity source of truth. The app-owned `users` row is the
stable domain actor referenced by organizations and audit events; only its
display name and email are derived. `auth:rebuildUserProjectionBatch` rebuilds
those fields from Better Auth in pages of 100. Invoke the internal mutation from
operator-only maintenance code, starting with a `null` cursor and repeating
with `continueCursor` until `isDone` is true. Auth deletion intentionally keeps
the domain actor row so historical references remain valid while clearing its
derived name and email. If duplicate actor rows exist for one Better Auth
subject, triggers and rebuilds fail closed rather than deleting or modifying a
potentially referenced actor. Reconcile those references explicitly before
retrying the rebuild.
