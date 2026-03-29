# Playground MCP Verification

The playground now has one canonical MCP verification flow:

1. Sign in locally.
2. Create or join an organization on `/demo/permissions`.
3. Create real `mcp_*` keys on `/demo/mcp-keys`.
4. Open `/demo/mcp-verify`.
5. Run the generated `curl` commands against `/mcp`.

## What this covers

The verification worksheet is meant to prove the important MCP concepts end to end:

- public query: `list-notes`
- public mutation: `create-note`
- optional auth on a public function: `search-notes`
- auth-required user-scoped calls: `add-task`, `list-tasks`
- auth-required org-scoped query: `list-posts`, `list-comments`
- auth-required org-scoped mutation: `create-post`, `create-comment`, `update-post`
- permission denial: viewer blocked from `create-post`
- middleware + ownership check: `update-note`
- destructive preview + confirm: `delete-note`, `delete-post`
- bulk safety flow: `bulk-delete-notes`
- action + output schema: `export-notes`
- key lifecycle: create, touch, revoke

## Canonical local setup

- Run the playground locally with a working Convex backend.
- Sign in through Better Auth.
- Make sure your current user has an organization.
- Create one admin key, one member key, and one viewer key on `/demo/mcp-keys`.
- Keep the full secrets in the browser when prompted. The verification page reads those local copies to generate commands.

## Smoke expectations

When setup is correct:

- anonymous `tools/list` only shows public or optional-auth tools
- authenticated `tools/list` shows auth-required tools
- member-scoped MCP calls can create tasks, posts, and comments
- viewer `create-post` fails with an auth-style error
- destructive tools preview on the first call and execute on `_confirmed: true`
- successful authenticated MCP calls update `lastUsedAt` on the backing key
- revoked keys stop working immediately

## Common failure modes

- Missing org:
  `list-posts` and other scoped tools fail until the caller belongs to an organization.

- Missing full key:
  If the verification page only shows a prefix, paste the full `mcp_*` secret once on `/demo/mcp-verify` or recreate the key on `/demo/mcp-keys`.

- Missing `CONVEX_SERVICE_KEY`:
  Actor-backed MCP calls fail because authenticated `ctx.query()` / `ctx.mutation()` need service injection.

- No local `jq`:
  The generated commands depend on `jq` to extract session ids and created resource ids.

- Revoked key still selected:
  Go back to `/demo/mcp-keys`, create a fresh key, and reselect it on `/demo/mcp-verify`.

## Automated coverage

The route-level smoke suite lives in:

- `test/e2e/mcp-smoke.e2e.test.ts`

It bootstraps real `mcp_*` keys through test-only routes, then verifies:

- initialize
- anonymous and authenticated tool discovery
- public tool calls
- auth-required and scoped failures
- destructive preview + confirm
- revoked-key failure
- `mcpKeys.touch` side effect
