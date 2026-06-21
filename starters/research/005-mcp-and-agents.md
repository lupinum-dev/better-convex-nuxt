# 005 MCP And Agents

## Core Rule

Do not duplicate product functions for MCP or agents.

```text
Nuxt UI
Nitro route
MCP tool
Convex Agent tool
        |
        v
same Convex query/mutation/action
        |
        v
same actor/access/domain logic
```

Wrong:

```text
projects.update
projects.updateForMcp
projects.updateForAgent
```

Right:

```text
convex/projects.ts       source of truth
server/mcp/projects.ts   thin tool adapter
convex/agents/*.ts       thin agent tool adapter
app/**/*.vue             UI caller
```

## Actor Model

Minimum actor vocabulary:

```ts
type Actor =
  | { kind: 'user'; userId: Id<'users'> }
  | { kind: 'agent'; agentId: Id<'agents'>; subjectUserId?: Id<'users'> }
  | { kind: 'service'; serviceActorId: Id<'serviceActors'> }
  | { kind: 'system' }
```

The exact table names can vary by starter, but the invariant should not:

- resolve caller once;
- pass actor into access checks;
- audit actor and access path;
- do not trust transport claims as final authorization.

## MCP Requirements

An MCP-enabled starter needs:

- authenticated transport boundary;
- tool list;
- tool input schemas;
- tool call handlers;
- caller-to-actor resolution;
- rate limiting;
- input validation;
- output sanitization;
- audit;
- backend access re-checks;
- approval for destructive/sensitive writes.

Private workspace MCP can start with hashed bearer keys and service actors.
Public HTTP MCP should wait for OAuth/OIDC-grade authorization.

## Agent Requirements

An agent-enabled starter should compose Convex Agent:

- use Convex Agent for threads/messages/streaming/tool calls;
- pass organization/workspace/actor context into tools;
- use Convex Agent approval for human-in-the-loop tool calls where it fits;
- call app Convex functions from tools;
- track usage and rate limits where billing or abuse risk exists.

Do not build generic agent persistence until Convex Agent fails a concrete
starter requirement.

## Approval Model

Approval is required when a tool can:

- delete data;
- send external messages;
- spend money;
- grant/revoke access;
- publish or promote AI-generated draft data into canonical state;
- export sensitive data;
- create long-lived credentials.

Approval should bind at least:

- actor;
- organization/workspace;
- action/tool/operation id;
- normalized args hash;
- expiry;
- single-use consumed state.

Do not claim drift safety unless the implementation also binds loaded record
versions or preview state.

## Thin Adapter Example

```ts
server.tool('projects.update', schema, async (args, mcpContext) => {
  const actor = await resolveMcpActor(mcpContext)
  return convex.mutation(api.projects.update, {
    ...args,
    actorToken: await mintShortLivedActorToken(actor),
  })
})
```

The Convex mutation still does:

```ts
const actor = await requireActor(ctx)
await requireOrgAccess(ctx, actor, {
  organizationId: args.organizationId,
  permission: 'project.update',
})
```

## Non-Defaults

Do not default to:

- generated MCP wrappers;
- generated operation refs;
- per-key permission intersections;
- public OAuth MCP;
- agent-provided role claims;
- tool annotations as enforcement;
- frontend-managed acting-on-behalf state.

Reopen these only when a starter has a concrete acceptance criterion that
requires them.
