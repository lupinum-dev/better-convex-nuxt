# MCP Agent Starter

Starter for organization apps where humans sign in with Better Auth, app-owned
organizations stay canonical in Convex, and service actors call a small private
MCP surface on behalf of an organization.

## Organization Ownership

This starter intentionally uses app-owned Convex `organizations` and
`memberships` tables because service actors, credentials, approvals, and audit
events are product-domain records scoped to those organizations.

It does not enable the Better Auth Organization plugin. If you enable Better
Auth Organization, remove independent org/member truth and key service actors,
credentials, approvals, projects, and audit events by Better Auth organization
ids.

## Includes

- clickable Nuxt UI for sign-up/sign-in, user bootstrap, organization creation,
  human project creation, service actor credential creation, and MCP project
  creation;
- organizations and memberships;
- service actors scoped to one organization;
- service actor roles limited to `viewer`, `member`, and `admin`;
- credential hashes;
- Nuxt MCP Toolkit Streamable HTTP route at `/mcp`;
- demo server route at `/api/demo/mcp-projects` that uses the official MCP SDK
  client to call this app's `/mcp` route;
- file-discovered project tools under `server/mcp/tools/`;
- project read/write tools plus preview/request/execute approval flow for delete;
- starter-local MCP tool wrapper utilities with boundary auth/input checks and
  denial telemetry;
- approval-gated destructive mutation;
- schema-bounded approval operation and audit labels for service actor calls;
- local validation at each boundary: app forms, Nitro demo routes, MCP tool
  inputs, and Convex handlers each validate their own input shape.

## Non-goals

- no public OAuth MCP;
- no role-filtered tool listing yet; Convex execution-time authorization is
  the source of truth;
- no generated tool wrappers;
- no broad platform manifest;
- no custom agent runtime;
- no app usage ledger; do not add caller-supplied usage recording here;
- no shared B2B package yet.

## Commands

```bash
pnpm install
pnpm convex:dev
pnpm dev
pnpm test
pnpm typecheck
pnpm build
pnpm verify:browser
```

Use the package scripts instead of direct binaries such as `pnpm convex dev`.
`pnpm convex:dev` prepares Nuxt types before starting Convex.

On first run, Convex writes `VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL` to
`.env.local`. This starter reads those defaults directly. You can override them
with `NUXT_PUBLIC_CONVEX_URL`, `NUXT_PUBLIC_CONVEX_SITE_URL`, or
`CONVEX_SITE_URL`.

Set `SITE_URL` and `BETTER_AUTH_SECRET` in Convex before starting auth routes,
including for local development. The request factory always fails closed
without explicit runtime values. `pnpm verify:browser` supplies isolated proof
values itself.

`pnpm build` also starts the generated Nitro server and asserts that `/`
renders the MCP auth surface with HTTP 200.

The MCP route is `/mcp`. It uses `@nuxtjs/mcp-toolkit` for Streamable HTTP,
including `initialize`, `tools/list`, and `tools/call`. Nitro authenticates
agents at this route with a bearer token. Server code forwards the raw token to
Convex with `MCP_SERVER_SECRET`; Convex verifies the server call, hashes the
bearer token, and looks up `agentCredentials.secretHash`.

The home page walks through the supported user stories:

1. create or sign in to a Better Auth user;
2. explicitly bootstrap the app-owned Convex user with `users.upsertCurrent`;
3. create an app-owned organization and owner membership;
4. create a project as the signed-in human;
5. create a service actor credential; Convex returns the bearer secret once and
   stores only its SHA-256 hash;
6. create a project through MCP with the server-minted bearer secret;
7. request and approve a destructive MCP project delete;
8. execute the approved delete through MCP and see the project disappear from
   the active project list.

`pnpm verify:browser` starts local Convex and Nuxt, then drives a real browser
through sign-up, app-user bootstrap, organization creation, human project
creation, service actor credential creation, MCP project creation through the
demo route, MCP delete preview, MCP approval request, in-app human approval, MCP
delete execution, project-list verification, and sign-out. It requires ports
`3000`, `3210`, and `3211` to be free. If Chromium is not installed yet, run
`pnpm exec playwright install chromium`.

Better Auth routes are registered in `convex/http.ts` at `/api/auth/*`, and the
Nuxt auth proxy forwards to the Convex HTTP Actions URL.

Project tools are always listed. Tool execution parses exactly
`Bearer <secret>` from MCP request metadata. Nitro never logs or stores that
secret; it calls Convex with the bearer token and private `MCP_SERVER_SECRET`.
Convex rejects calls without the server secret, hashes the bearer token, and
derives organization scope from the stored credential. MCP tool input does not
carry `organizationId`. Convex is the authorization boundary for organization,
role, credential status, and approvals; tool visibility is not treated as
permission.

The starter keeps its MCP glue in `server/utils/mcpProjectTools.ts`. That file
is intentionally copyable userland code, not framework runtime magic. It
centralizes bearer parsing, tool input validation, `tool -> checked Convex
entrypoint` mapping, response shaping, and minimal boundary denial logging
without turning Nuxt into the product authority.

`/api/demo/mcp-projects` exists only to make the browser demo exercise the real
MCP transport. It accepts a one-time bearer secret from the page, calls
`projects.create` through `/mcp` without a caller-supplied organization id, and
returns only text content from the MCP result. Product permissions still live
in Convex. Destructive MCP writes use the app-owned approval flow:
`projects.delete.preview`, `projects.delete.requestApproval`,
`approvals.get`, and `projects.delete.execute`. The execute tool requires an
approved Convex approval request and re-checks service actor role, organization
scope, approval status, expiry, and project state before soft-deleting.

Set `MCP_SERVER_SECRET` in Convex and Nuxt for every deployed environment.
Generate at least 32 characters from a cryptographically secure random source;
both boundaries reject missing, short, or whitespace-padded values.
Convex fails closed when the secret is missing. The local browser verifier
injects a demo secret into its spawned Convex/Nuxt processes, but application
code does not provide a fallback.

The test suite proves the Streamable HTTP route with a real MCP SDK client
against a Convex-shaped HTTP backend, the UI demo route through the same MCP
path, and the project tool adapters against real `convex-test` product
functions. Human and service actor project wrappers share the same domain
operations. Convex normalizes and bounds project names, so MCP tool input cannot
create blank, whitespace-only, or overlong product names. Organization reads
require active membership, current users can list only their active
organizations, and member/service actor listing requires owner/admin. Service
actor project functions require the server secret and derive organization scope
from the stored credential, so MCP callers cannot retarget another organization
by input. Service actor credential issuance is scoped to the stored credential
organization and requires an active owner/admin membership. Service actors
cannot be assigned the human `owner` role. Issuance generates a bearer secret
server-side, stores only its SHA-256 hash, and rejects duplicate stored hashes
before inserting a service actor. Destructive approvals derive the organization
from the target project, require an active owner/admin membership, and store the
approving human user. The suite also guards against reintroducing a fake
caller-supplied agent usage action. Streamable HTTP tool-call tests assert MCP
responses do not expose the bearer secret, its SHA-256 hash, the credential hash
field name, server secret, or raw project documents.

Call `users.upsertCurrent` after Better Auth sign-in before using human-scoped
Convex functions. `requireCurrentUser` intentionally expects the app-owned user
row to exist.
