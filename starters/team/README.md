# Team Starter

B2B SaaS baseline for products with organizations, memberships, invitations,
role checks, projects, and audit events.

## Organization Ownership

This starter enables the Better Auth Organization plugin as the research path.
Better Auth is the canonical organization, member, invitation, team, and role
state. The app `users` table is a derived projection keyed by the Better Auth
user id.

Use app-owned Convex tables only for product data or explicitly derived,
rebuildable projections. Do not mirror Better Auth organization/member state in
app tables as a second source of truth.

## Includes

- users projected from Better Auth users;
- Better Auth-managed organizations, memberships, teams, roles, and invitations;
- Better Auth-managed organization and user API keys;
- project mutations protected by Better Auth organization permissions;
- optional team-scoped project mutations protected by Better Auth `teamMember` state;
- audit events for product writes.

## Non-goals

- no agency/client delegation;
- no MCP;
- no agents;
- no ABAC, ReBAC, custom roles, or materialized permissions;
- no shared B2B package until another starter proves the same invariants.

## Final Verdict

The starter default is Better Auth for auth-domain state and Convex app tables
for product-domain state. Core organizations, teams, roles, invitations, product
permissions, API keys, MFA/passwordless/passkeys, and the verification loop are
runtime-proven.

Organization deletion is intentionally not a starter UI feature. The verified
advanced recipe is to revoke org API keys, enable `teams.allowRemovingAllTeams`
for the deletion workflow, remove all teams through Better Auth routes, delete
the organization through Better Auth, and treat stale session active ids as
display-only.

Stripe, SCIM, OAuth/OIDC/MCP provider surfaces, and enterprise SSO are not base
starter defaults. Stripe is locally proven only with a fake client; SCIM is
blocked for full lifecycle by PUT/PATCH/DELETE route support; SSO is not a pure
Convex starter feature today.

## Commands

```bash
pnpm install
pnpm dev
pnpm feedback:local-baseline
pnpm feedback:better-auth-user-additional-fields
pnpm feedback:better-auth-member-additional-fields
pnpm feedback:better-auth-table-smoke
pnpm feedback:better-auth-client-surface
pnpm feedback:better-auth-org-teams
pnpm feedback:better-auth-org-delete-product-access
pnpm feedback:better-auth-org-safe-delete-teams-limit
pnpm feedback:better-auth-org-allow-remove-all-teams
pnpm feedback:starter-ui-cutover
pnpm feedback:better-auth-all
pnpm test
pnpm typecheck
```

`pnpm feedback:local-baseline` is the self-contained agent-visible baseline. It
starts local Convex if needed, hard-resets the local deployment, runs the agent
feedback probes, hard-resets again, inspects the app and Better Auth component
tables, and stops the Convex server it started.

`pnpm feedback:better-auth-user-additional-fields` proves Better Auth owns
session/profile fields such as locale, timezone, and marketing preference. The
app `users` projection intentionally does not mirror those fields by default.

`pnpm feedback:better-auth-member-additional-fields` proves Better Auth owns
lightweight member profile fields such as title, department, and billable at
server-side member creation time. Public HTTP add-member is not exposed here,
and role updates are not generic member-profile updates.

`pnpm feedback:better-auth-table-smoke` is the fast agent-visible loop for
user/org/table changes. It starts local Convex if needed, creates users, creates
and updates an organization, creates and updates teams, accepts an invitation,
downgrades and removes a member, writes product rows, prints app and Better Auth
component tables, and asserts the team starter does not recreate app-owned
organization/member mirrors.

`pnpm feedback:better-auth-client-surface` is the fast typed Nuxt client check.
It proves `useTeamAuthClient()` preserves Better Auth plugin namespaces and
representative methods for organizations, Admin, API keys, SCIM, passkeys,
two-factor, email OTP, magic link, and additional fields through
`createBetterConvexAuthClient()`.

`pnpm feedback:better-auth-org-teams` proves Better Auth can own team state for
team-scoped product behavior. It creates two teams, invites one member into one
team and another member only into the organization, then proves Convex product
functions can write/read a team-scoped project only when the caller has a
Better Auth `teamMember` row. It does not add app-owned team mirrors.

`pnpm feedback:better-auth-org-delete-product-access` proves the current raw
organization deletion boundary. Better Auth removes organization/member/invitation
rows and stale sessions lose Convex product access, but default/explicit team
rows, teamMember rows, and some stale active session fields can remain. Do not
use raw `/api/auth/organization/delete` as the product deletion flow.

`pnpm feedback:better-auth-org-safe-delete-teams-limit` proves the best-effort
public route cleanup boundary. Better Auth can remove non-last teams and their
teamMember rows, but the default team settings reject deleting the final team, so
route cleanup plus raw org deletion can still leave one team/teamMember row.

`pnpm feedback:better-auth-org-allow-remove-all-teams` proves the Better Auth
option for complete team cleanup. With the local experiment flag mapped to
`teams.allowRemovingAllTeams`, public Better Auth routes can remove every team
and teamMember row before org deletion. Stale session active ids and API-key
cleanup remain separate deletion concerns.

`pnpm feedback:starter-ui-cutover` is the browser-backed Nuxt check. It signs up
through the real UI, creates a Better Auth organization, creates a product row
through the real Convex `projects` functions, signs out, then asserts Better
Auth owns organization/member rows and the app does not write legacy
organization/member/project tables.

`pnpm feedback:better-auth-all` is the slower self-contained research contract.
It starts local Convex if needed, resets the local deployment, runs every
shared-server Better Auth plugin spike, including the passkey server/runtime
boundary, generic OAuth runtime probe, and partial SCIM runtime probe, performs a
final hard reset, inspects the tables the agent can see from the CLI, and stops
only the Convex server it started. Port-owning browser/log probes remain separate.

`pnpm feedback:better-auth-generic-oauth` temporarily enables a local synthetic
generic OAuth provider, signs in through `/api/auth/sign-in/oauth2`, completes the
callback, verifies Better Auth `verification`/`account`/`user`/`session` rows plus
the app `users` projection, and proves consumed-state replay is rejected.

`pnpm feedback:better-auth-oauth-proxy` is an expected-limit probe. It proves
`oAuthProxy()` rewrites Generic OAuth state/callback data, but the Generic OAuth
callback route does not decrypt proxy state and fails with `state_mismatch`.

`pnpm feedback:better-auth-api-key-safe-org-delete` is the organization deletion
safety probe. It proves raw Better Auth organization deletion can leave org-scoped
API keys valid, server-side cleanup through the API-key plugin currently fails in
Convex with `dynamic module import unsupported`, and route/client-level Better
Auth key deletion can revoke known org-scoped key configs before deleting the
organization.

`pnpm feedback:better-auth-stripe` temporarily enables the local Stripe
experiment. It proves the Better Auth Stripe package can generate the local
component `subscription` table, an organization owner can list org subscriptions,
an outsider is rejected, checkout start writes an incomplete Better Auth
subscription row, checkout success activates it, Convex product logic can enforce
the configured project limit from the active Better Auth subscription row, and no
app billing mirror is written. It does not prove webhooks, real Stripe network
calls, billing portal, or seat sync.

`pnpm feedback:better-auth-passkey-browser` is separate because it owns ports
`3000`, `3210`, and `3211`. It starts a minimal localhost origin, uses
Playwright's Chromium virtual authenticator, registers a passkey, signs out,
signs back in with the passkey, verifies Better Auth `passkey`/`session` rows,
then hard-resets and inspects empty tables.

## Auth Environment

Set these in Convex before using auth routes:

```bash
npx convex env set SITE_URL http://localhost:3000
npx convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
```
