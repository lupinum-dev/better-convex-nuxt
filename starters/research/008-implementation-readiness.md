# 008 Implementation Readiness

Status: pass 3.

This pass turns the research into starter-ready requirements without building
the starters yet.

## First Starter To Build

Recommended first build: `public`.

Why:

- proves the base Nuxt + Convex starter can stay tiny;
- creates the file/folder standard for the family;
- avoids solving B2B and MCP before the simplest app is excellent;
- gives a control case for later starters to compare against.

Recommended second build: `team`.

Why:

- proves organization/membership/RBAC without agency or MCP;
- likely produces the first shared access helper candidates.

Recommended third build: `agency`.

Why:

- forces delegated access and audit path correctness before MCP/agents reuse the
  actor model.

## Starter File Lists

### `public`

```text
starters/public/
  README.md
  AGENTS.md
  package.json
  nuxt.config.ts
  tsconfig.json
  convex.json
  convex/
    schema.ts
    todos.ts
    todos.test.ts
    tsconfig.json
  app/
    app.vue
```

Required tests:

- create rejects empty text;
- list ordering is deterministic enough for UI;
- no auth/org files exist.

### `team`

```text
starters/team/
  README.md
  AGENTS.md
  package.json
  nuxt.config.ts
  tsconfig.json
  convex.json
  convex/
    schema.ts
    auth.ts
    users.ts
    organizations.ts
    memberships.ts
    invitations.ts
    access.ts
    audit.ts
    projects.ts
    *.test.ts
  app/
    app.vue
    pages/
      index.vue
      organizations/[organizationId].vue
```

Required invariants:

- user can belong to multiple organizations;
- active membership grants role permissions;
- removed/suspended membership denies access;
- invite acceptance creates exactly one active membership;
- product mutation checks `requireOrgAccess`;
- frontend role display is not required for backend authorization.

### `agency`

```text
starters/agency/
  README.md
  AGENTS.md
  package.json
  nuxt.config.ts
  tsconfig.json
  convex.json
  convex/
    schema.ts
    auth.ts
    users.ts
    organizations.ts
    organizationLinks.ts
    memberships.ts
    access.ts
    audit.ts
    clientProjects.ts
    *.test.ts
  app/
    app.vue
    pages/
      agency.vue
      clients/[organizationId].vue
```

Required invariants:

- agency member can list linked client workspaces only;
- agency member cannot access unlinked clients;
- client member cannot access sibling clients;
- revoked link removes delegated access;
- audit records `direct` or `delegated` access path.

### `mcp-agent`

```text
starters/mcp-agent/
  README.md
  AGENTS.md
  package.json
  nuxt.config.ts
  tsconfig.json
  convex.json
  convex/
    schema.ts
    auth.ts
    users.ts
    organizations.ts
    memberships.ts
    serviceActors.ts
    agentCredentials.ts
    access.ts
    audit.ts
    projects.ts
    agents.ts
    *.test.ts
  server/
    mcp/
      index.post.ts
      tools.ts
```

Required invariants:

- valid service actor can call exposed read tool;
- valid service actor can call exposed write tool;
- revoked credential fails;
- tool args cannot target a different organization;
- Convex execution re-checks role/access even if tool was listed earlier;
- sensitive write requires approval.

### `vertical-ai`

```text
starters/vertical-ai/
  README.md
  AGENTS.md
  package.json
  nuxt.config.ts
  tsconfig.json
  convex.json
  convex/
    schema.ts
    auth.ts
    organizations.ts
    access.ts
    audit.ts
    domainRecords.ts
    drafts.ts
    agents.ts
    approvals.ts
    *.test.ts
  app/
    app.vue
    pages/
      index.vue
      drafts.vue
```

Required invariants:

- AI writes draft state, not canonical state;
- human approval promotes draft to canonical state;
- rejected draft cannot be promoted;
- approval records actor and source draft;
- usage/rate-limit hook exists or is explicitly deferred in README.

## Minimal Shared Package Extraction Gate

Do not create `packages/convex-b2b` until after `team` and `agency` both have
working tests.

Extraction is justified only if all are true:

1. `access.ts` or `audit.ts` duplicates the same invariant in both starters.
2. The shared API is smaller than the duplicated code.
3. The shared package can be tested without Nuxt.
4. The starter remains understandable after extraction.
5. There is no app-specific policy hidden inside the package.

## Minimal MCP Spike Design

Before building `mcp-agent`, create a spike branch or scratch starter with:

```text
tools/list:
  projects.list

tools/call:
  projects.list
  projects.create
```

Data:

```text
organizations
memberships
serviceActors
agentCredentials
projects
auditEvents
```

Flow:

1. MCP bearer key is hashed.
2. Hash resolves an active credential and service actor.
3. Tool adapter injects/resolves actor context.
4. Tool calls normal Convex function.
5. Convex function checks organization access.
6. Convex function writes audit event.

Pass criteria:

- `tools/list` returns only tools exposed to the service actor role.
- `tools/call projects.list` returns only current organization projects.
- `tools/call projects.create` creates only in credential organization.
- revoked credential denies both list and call;
- role change is honored without reissuing the credential;
- audit event stores actor, organization, tool/action, and result.

## Verification Matrix

| Starter | Typecheck | Unit/Invariants | Browser Smoke | MCP Smoke | Agent Smoke |
| --- | --- | --- | --- | --- | --- |
| `public` | Required | Required | Required | No | No |
| `personal` | Required | Required | Required | No | Optional |
| `team` | Required | Required | Required | No | Optional |
| `agency` | Required | Required | Required | Optional | Optional |
| `mcp-agent` | Required | Required | Required | Required | Required |
| `vertical-ai` | Required | Required | Required | Optional | Required |

Do not add a Trellis-style doctor in the first implementation. Use normal
package scripts first. Add diagnostics only when generated artifacts or repeated
misconfiguration make normal tests insufficient.

## Research Completion Criteria

Research is sufficient to begin a starter only when:

- target starter is selected;
- exact file list is known;
- non-goals are listed in its README/AGENTS;
- invariant tests are named before implementation;
- shared extraction gate is explicit;
- MCP/agent host unknowns are isolated to a spike, not hidden in the starter.
