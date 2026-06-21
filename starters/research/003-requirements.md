# 003 Requirements

## Product Requirements

1. Provide multiple prepared starters, not one configurable mega-template.
2. Every starter must be a complete, runnable app shape.
3. Every starter must omit capabilities it does not use.
4. Starter code should look like normal Nuxt + Convex app code.
5. Shared abstractions are allowed only for repeated invariants, not imagined
   future flexibility.
6. Recipes may copy code into the app, shadcn-style.
7. Starters must be useful for real B2B, agency, SaaS, and agent-enabled apps.

## Architecture Requirements

1. Convex is the source of truth for data invariants and authorization.
2. Nuxt is a caller/UI/runtime surface, not an authorization authority.
3. MCP and agents are caller surfaces, not separate backend models.
4. Product functions should not be duplicated for UI, Nitro, MCP, and agents.
5. Frontend access state is a hint only; Convex handlers re-check access.
6. Derived/generated artifacts must be rebuildable and have a drift story.
7. Destructive actions exposed outside a direct trusted UI path need explicit
   backend approval or a documented product reason.
8. Every security-sensitive event should have an audit record.

## Starter Family Requirements

### `public`

- No auth.
- No organizations.
- No MCP.
- Public reads and intentionally public writes only.
- Acceptance: a user can run a small realtime CRUD app without learning B2B
  concepts.

### `personal`

- Authenticated user app.
- Per-user data.
- No organizations.
- Acceptance: a user can build a private dashboard/tool without fake workspaces.

### `team`

- Organizations/workspaces.
- Users can belong to multiple organizations.
- Memberships carry role/status/timestamps.
- Invitations by email.
- Simple app-owned RBAC.
- Audit for membership, invitation, role, and sensitive product events.
- Acceptance: a product mutation can be protected with one backend
  `requireOrgAccess` call.

### `agency`

- Agency organizations and client organizations.
- Active delegated link from agency to client.
- Agency members can access client workspace only through explicit delegated
  assignment/role.
- Client members cannot see sibling clients or the agency workspace unless
  separately granted.
- Audit records direct versus delegated access path.
- Acceptance: one agency user can manage multiple client workspaces, and each
  client can see only its own data.

### `mcp-agent`

- Organization model.
- Service actors/API keys or OAuth-ready token boundary.
- MCP tools call normal Convex functions.
- Agent tools call normal Convex functions.
- Tool listings are advisory; execution re-checks current authority.
- Sensitive/destructive writes use approval.
- Acceptance: the same Convex mutation is callable from Nuxt and from MCP
  without duplicated authorization.

### `vertical-ai`

- Domain-specific AI SaaS flow.
- Convex Agent for threads/messages/tools.
- Draft records separate from canonical records.
- Human approval before promoting AI-generated drafts into canonical state.
- Usage/rate-limit hooks documented.
- Acceptance: AI can draft domain work, but canonical writes remain explicit,
  audited, and authorized.

## Shared Kernel Candidate Requirements

Only extract shared code after at least two starters use the same invariant.

Candidate functions:

```ts
requireActor(ctx)
requireOrgAccess(ctx, actor, { organizationId, permission })
canOrgAccess(ctx, actor, { organizationId, permission })
resolveOrgAccess(ctx, actor, organizationId)
recordAuditEvent(ctx, event)
```

Candidate tables:

```text
organizations
memberships
invitations
organizationLinks
serviceActors
agentCredentials
auditEvents
```

Do not add by default:

- ABAC.
- ReBAC.
- custom tenant-defined roles.
- permission override tables.
- materialized effective permission tables.
- nested teams.
- bridge exports.
- generated operation projections.
- CLI add-lanes.
- public OAuth MCP.

## Verification Requirements

Each starter should have:

- `pnpm install` works.
- `pnpm dev` works.
- `pnpm convex:codegen` works when Convex files exist.
- `pnpm typecheck` works.
- focused invariant tests for auth/access/domain rules.
- `AGENTS.md` that states source-of-truth and non-default complexity rules.

Advanced starters should also have tests proving:

- revoked membership loses access;
- delegated agency access does not leak between clients;
- revoked agent credential fails;
- MCP/agent tool execution re-checks backend authority;
- destructive approval fails closed on missing/expired/mismatched token.
