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

## Before production

The playground is now good for local verification, but a few deliberate shortcuts
still need to be removed before this pattern is production-ready.

### Security and secrets

- Replace the hardcoded local fallback service key in `playground/shared/dev-service-key.ts`
  with real environment-only secret management.
- Remove the playground fallback validator in `playground/convex/actor.config.ts`
  so service auth only succeeds through the real configured secret.
- Rotate any local demo keys and service keys used during development.
- Make sure production MCP keys are created, stored, and revoked only through the
  real key lifecycle flow. Do not rely on browser-local copies of full secrets.

### Test-only and local-only code

- Restore a real environment gate for `playground/convex/testing.ts`.
  Right now reset/seed helpers are intentionally hard-enabled for local work.
- Ensure `playground/server/api/test-mcp-bootstrap.post.ts` and
  `playground/server/api/test-mcp-state.get.ts` stay unavailable outside test/dev.
- Review `playground/pages/demo/mcp-verify.vue` and related demo pages so they are
  either removed from production or explicitly guarded behind a non-production flag.

### Runtime and deployment hardening

- Fix or remove the broken `pnpm dev:local` / `convexLocal(...)` path. It is still a trap.
- Confirm the real deployment has the required env vars wired on both sides:
  `CONVEX_SERVICE_KEY`, Better Auth secrets, site URL, and any MCP auth config.
- Verify service actor injection works in the real hosted Convex environment without
  any playground-only fallback behavior.
- Re-run the full MCP audit against staging with real hosted URLs and real `mcp_*` keys.

### Behavior and contract cleanup

- Decide whether the production MCP endpoint is intentionally stateless/SSE-only or
  whether it should expose a session id. The tests now follow the current stateless behavior.
- Review auth-only tool visibility rules. Today anonymous or revoked callers can see
  `tool not found` because those tools are hidden from discovery.
- Confirm destructive preview semantics and permission boundaries for each role in staging,
  especially admin-only operations like `delete-post`.

### Release checks

- Run:
  `pnpm vitest run --project=e2e test/e2e/mcp-smoke.e2e.test.ts`
- Run:
  `pnpm test:types`
- Run the generated `curl` worksheet on `/demo/mcp-verify` against the target environment.
- Do one manual revoke-key check and verify `lastUsedAt` updates on successful calls.
