# AI Learnings

Research date: 2026-06-22.

## Executive Verdict

Build AI as an opt-in SaaS Kit track, not as core `better-convex-nuxt` runtime.

The useful product is:

```txt
Better Auth = human identity, organizations, sessions, roles, API keys, OAuth clients
Convex = product state, final authorization, workflows, audit, agent delegation
Convex Agent = threads, messages, streaming, LLM tool calls, tool approval, usage hooks
Nuxt = UX, auth proxy, MCP endpoint hosting, thread UI, approval UI
Nuxt MCP Toolkit = MCP transport and file-based tool/app registration
```

Do not add a generic agent permission framework. Do not make agents members of Better Auth organizations by default. Do not duplicate product functions for UI, MCP, and agents.

The direction should split into two separate recipe tracks:

1. `agentic-saas`: in-product AI agents that act only through explicit app-owned delegation records.
2. `mcp-saas` or `platform-auth`: MCP/API surfaces for external tools and clients, starting private with service actors/API keys, then moving to OAuth only after the OAuth provider path is proven.

## Source Of Truth

| Concept | Owner | Rule |
| --- | --- | --- |
| User, session, organization, member, role | Better Auth local Convex component | No app-owned mirrors in SaaS templates. |
| API key secrets and key ownership | Better Auth API Key | Raw secrets never enter app tables. Product routes verify keys server-side. |
| OAuth clients, grants, access tokens | Better Auth OAuth Provider, when enabled | Advanced platform recipe only. Must prove lifecycle before public claim. |
| Agent thread/message history | Convex Agent component | Infrastructure only, not authorization authority. |
| Agent run/delegation | App Convex table | The canonical record that says what an agent may do. |
| Product data | App Convex tables | Store Better Auth organization ids as strings. |
| Product authorization | Convex product functions | Always re-check Better Auth/product invariants at execution time. |
| Product audit | App Convex table | Audit actor kind, delegating user, path, result, and resource. |
| MCP transport and tool discovery | Nuxt MCP Toolkit | Transport metadata only; never final authz. |

## Agentic SaaS Shape

The core rule is that an agent never receives ambient authority. A user with a Better Auth session starts a run. Convex verifies the user's organization permission, creates a Convex Agent thread, and stores an `agentRuns` row with bounded capabilities.

Minimum app-owned schema:

```ts
agentRuns: defineTable({
  organizationId: v.string(),
  threadId: v.string(),
  agentName: v.string(),
  status: v.union(
    v.literal("active"),
    v.literal("paused"),
    v.literal("completed"),
    v.literal("revoked"),
    v.literal("failed"),
  ),
  mode: v.union(
    v.literal("assistant"),
    v.literal("delegated"),
    v.literal("service"),
  ),
  startedByAuthUserId: v.string(),
  actingAsAuthUserId: v.optional(v.string()),
  capabilities: v.array(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
  expiresAt: v.optional(v.number()),
})
  .index("by_thread", ["threadId"])
  .index("by_organization", ["organizationId"])
```

This table is not a second membership system. It is the app-owned delegation record for one run.

Use one product actor shape across UI, API keys, MCP, and agents:

```ts
type ProductActor =
  | { kind: "user"; authUserId: string }
  | {
      kind: "agent";
      agentRunId: Id<"agentRuns">;
      delegatedByAuthUserId: string;
    }
  | { kind: "apiKey"; keyId: string; ownerAuthUserId?: string }
  | { kind: "service"; serviceActorId: Id<"serviceActors"> }
  | { kind: "system"; reason: string }
```

Agent tools should be thin adapters over normal product functions:

1. Load the `agentRuns` row.
2. Require `status === "active"`.
3. Require the tool argument `organizationId` to match the run.
4. Require the delegated capability.
5. For sensitive writes, optionally re-check the delegating user's current Better Auth permission.
6. Call normal Convex product functions or shared product helpers.
7. Write audit with `actor.kind = "agent"` and `delegatedByAuthUserId`.

Default agent writes should create drafts or proposals, not canonical product state. Canonical destructive actions require approval.

## Convex Agent Findings

Convex Agent is the right foundation to compose before building anything ourselves.

It provides:

- persisted, live-updating threads and messages;
- actions that run LLM calls in Convex;
- tool calls with Convex context;
- custom context such as `organizationId` or `agentRunId`;
- tool approval for dangerous operations;
- workflow composition for long-lived multi-step work;
- human-agent patterns for support handoff;
- usage handlers for token/cost attribution;
- rate-limiting examples for message and token usage.

Important constraint: scheduled functions and workflows may not have `ctx.auth` for the original user. That confirms the delegation record is required. Workflows must use `agentRuns`, not ambient auth.

## MCP Shape

MCP is a caller surface, not a separate product model.

```txt
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

Start with hand-written tool adapters. Generate wrappers only after repeated boilerplate is measured in a real starter.

Private MCP can use service actors or Better Auth API keys. Public HTTP MCP should wait for OAuth/OIDC-grade authorization.

For public MCP, the MCP spec pushes us toward:

- Streamable HTTP;
- Origin validation;
- proper authentication for all connections;
- OAuth 2.1 for protected resources;
- protected resource metadata discovery;
- authorization-server discovery;
- PKCE for clients;
- audience-bound tokens;
- no token passthrough to downstream APIs.

Tool annotations such as `readOnlyHint` and `destructiveHint` are hints only. They are useful UI metadata, not enforcement.

## Nuxt MCP Toolkit Findings

The local `/Users/matthias/Git/external/nuxt-mcp-toolkit` package is useful, but it should stay in the transport layer.

Useful pieces:

- file-based `server/mcp/tools`, `resources`, and `prompts`;
- multiple MCP handlers under different routes;
- request-time middleware that can attach `event.context`;
- `enabled(event)` guards to hide tools per caller;
- Streamable HTTP implementation through the MCP SDK;
- optional stateful sessions;
- same-origin Origin validation by default;
- MCP Apps from Vue SFCs with iframe CSP and ChatGPT compatibility metadata;
- elicitation helpers for confirmation/forms/URL prompts;
- test coverage for tool registration, middleware, sessions, filtering, apps, and security.

Limits:

- it does not implement OAuth;
- its OAuth metadata handler intentionally returns JSON 404 for well-known OAuth endpoints;
- middleware and `enabled(event)` are not final authorization;
- MCP Apps are UI widgets, not trusted backend clients;
- sessions default to memory storage when enabled;
- adding it to this repo needs dependency alignment (`h3`, `zod`, Nuxt/Nitro versions).

Recommendation: use `@nuxtjs/mcp-toolkit` for a real MCP endpoint spike instead of maintaining a custom JSON-RPC route, but keep all product authorization in Convex functions.

## Better Auth Findings

Better Auth remains the heavy-lifting auth layer.

Confirmed direction from existing research:

- Better Auth Organization owns organizations, members, invitations, roles, teams when enabled, and permission checks.
- `auth.api.hasPermission()` can check explicit `organizationId`; Convex product functions should call it.
- Organization dynamic roles work, but add `organizationRole` and admin UI complexity, so they are advanced.
- Organization-owned API keys work for service integrations, but product routes must also verify the referenced organization still exists.
- Better Auth local Convex component is required for schema-changing plugins.

For MCP/platform auth:

- the current Better Auth `mcp()` plugin docs say it will be deprecated in favor of OAuth Provider;
- the newer OAuth 2.1 Provider docs advertise MCP support, dynamic client registration, JWT/JWKS behavior, introspection, and revocation;
- existing local research against installed packages found important limits in the older OIDC/MCP path: missing revoke/introspect, reusable old refresh tokens, no client credentials, advertised MCP userinfo/JWKS returning 404, and raw dynamic MCP client secrets.

So the platform-auth recommendation is: do not ship public OAuth/MCP as a default. Spike the current `@better-auth/oauth-provider` package with the local Convex component first.

The Better Auth Agent Auth plugin is interesting but not default. It is explicitly unstable and adds agent/host/grant/approval concepts. That is useful only if we decide to implement a standards-based external agent provider. For the in-product `agentic-saas` template, app-owned `agentRuns` plus Convex Agent is simpler and clearer.

## Local Starter Findings

`starters/mcp-agent` proves useful product patterns:

- bearer token is hashed before Convex sees it;
- service actor is scoped to an organization;
- product functions re-check actor status, credential status, organization, and role;
- cross-organization arguments are rejected;
- role downgrade takes effect at execution time;
- destructive project delete requires approval;
- tool responses do not expose raw bearer secrets or stored credential hashes.

But it is not the future default because it owns `organizations` and `memberships`. Its own README says to delete those if Better Auth Organization is enabled. Treat it as a proof of service actors, approvals, and secret handling, then refactor it into the Better Auth source-of-truth model.

Existing `starters/research/005-mcp-and-agents.md` remains correct: MCP tools and agent tools should call the same product functions as the UI.

## Recommended Template

`agentic-saas` should include:

- Better Auth local Convex component;
- Better Auth Organization with static roles;
- Convex Agent component;
- app-owned `agentRuns`;
- app-owned product audit that can represent `user`, `agent`, `apiKey`, `service`, and `system` actors;
- tool guards in `convex/lib/agentAuthz.ts`;
- tools in `convex/agentTools.ts` that call normal product functions;
- draft-first product examples;
- approval UI for destructive/sensitive tools;
- usage tracking by organization, user, and run;
- rate limiting by organization, user, and run;
- scenario tests for cross-tenant isolation, revoked runs, permission downgrade, and approval.

It should not include:

- app-owned organization/member/invitation mirrors;
- agent-owned membership tables;
- generic permission DSLs;
- generated MCP wrappers;
- autonomous destructive writes by default;
- Better Auth Agent Auth by default;
- public OAuth MCP by default.

`mcp-saas` or `platform-auth` should include:

- a Nuxt MCP Toolkit endpoint;
- middleware that resolves the caller into a product actor;
- tools that call normal Convex product functions;
- private service actor or Better Auth API-key authentication first;
- optional MCP Apps only as UI widgets;
- public OAuth only after the OAuth Provider spike passes.

## What Is Missing

### Must Prove Before Claiming Agentic SaaS

- Install and wire `@convex-dev/agent` in a Better Auth Organization starter.
- Generate and commit Convex Agent component code.
- Implement `agentRuns` with hard invariants.
- Implement `requireAgentCapability()`.
- Prove tools call normal product functions, not bypass mutations.
- Build one draft-first tool and one approval-gated destructive tool.
- Build a Nuxt approval queue that verifies the approver is authorized.
- Attribute usage to `organizationId`, `agentRunId`, `startedByAuthUserId`, model, provider, and tokens.
- Add rate limiting by user/org/run.
- Add redaction rules for tool outputs saved into thread history.
- Decide retention/deletion policy for agent messages and product audit.

### Must Prove Before Claiming MCP Platform Auth

- Decide whether Nuxt MCP Toolkit is the default host or only a recipe.
- Align dependencies and run a real MCP client against the Nuxt endpoint.
- Prove Streamable HTTP `initialize`, `tools/list`, and `tools/call`.
- Prove Origin rejection.
- Prove auth middleware maps to a stable actor.
- Prove disabled tools are not listed for unauthorized callers.
- Prove tool execution still fails if a caller sends an undeclared or unauthorized operation.
- Spike `@better-auth/oauth-provider` with the local Convex component.
- Verify OAuth protected resource metadata and authorization server metadata routes.
- Verify dynamic client registration behavior.
- Verify PKCE and audience/resource-bound tokens.
- Verify revocation and introspection against the actual installed version.
- Decide token invalidation semantics for product routes.
- Decide whether client credentials are real; otherwise keep service integrations on API keys.

### Must Fix Or Retire

- Refactor `starters/mcp-agent` away from app-owned organizations/memberships if it becomes part of the SaaS Kit.
- Avoid teaching the deprecated Better Auth `mcp()` plugin as the preferred path.
- Do not present Better Auth Agent Auth as product direction until compatibility and source-of-truth ownership are proven.
- Add docs explaining that MCP Apps and tool annotations are not authorization controls.
- Add a small source-of-truth guide for user, organization, API key, agent run, thread, and audit records.

## Acceptance Tests

Minimum `agentic-saas` tests:

- outsider cannot start an agent run for another organization;
- user without product permission cannot start a write-capable run;
- agent cannot call a tool outside its delegated capability list;
- agent cannot access another organization's resource;
- revoked run cannot call tools;
- expired run cannot call tools;
- destructive tool creates a pending approval and does not mutate before approval;
- unauthorized user cannot approve;
- approved destructive tool is single-use;
- role downgrade or member removal blocks future high-risk agent actions;
- product audit distinguishes `agent` actor and delegating user;
- usage is attributed to org/user/run;
- thread query verifies the thread belongs to an accessible active run.

Minimum `mcp-saas` tests:

- missing bearer/API key is rejected;
- revoked credential is rejected;
- wrong organization argument is rejected;
- read-only actor cannot write;
- listed tools match actor permissions;
- direct `tools/call` still re-checks backend permissions;
- raw secrets and credential hashes never appear in tool output;
- Origin validation rejects invalid browser origins;
- public OAuth tokens, if enabled, require correct audience/resource and scope.

## Recommended Next Work

1. Build a tiny `agentic-saas` spike on top of the current Better Auth Organization team starter.
2. Keep the first tool read-only and the second draft-only.
3. Add one approval-gated destructive tool only after the first two pass.
4. In parallel, create a separate Nuxt MCP Toolkit spike that exposes one read tool and one write tool through the same product functions.
5. Leave Better Auth OAuth Provider and Agent Auth as separate platform-auth spikes until the basic agent run model is green.

## Sources Checked

Local:

- `docs/content/docs/8.architecture/1.saas-kit-direction.md`
- `new-direction.md`
- `learnings.md`
- `starters/research/005-mcp-and-agents.md`
- `starters/mcp-agent`
- `/Users/matthias/Git/external/nuxt-mcp-toolkit`

External:

- https://docs.convex.dev/agents/overview
- https://docs.convex.dev/agents/getting-started
- https://docs.convex.dev/agents/tools
- https://docs.convex.dev/agents/tool-approval
- https://docs.convex.dev/agents/threads
- https://docs.convex.dev/agents/workflows
- https://docs.convex.dev/agents/human-agents
- https://docs.convex.dev/agents/usage-tracking
- https://docs.convex.dev/agents/rate-limiting
- https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
- https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
- https://modelcontextprotocol.io/specification/2025-11-25/server/tools
- https://modelcontextprotocol.io/specification/draft/basic/authorization/security-considerations
- https://better-auth.com/docs/integrations/convex
- https://better-auth.com/docs/plugins/organization
- https://better-auth.com/docs/plugins/api-key
- https://better-auth.com/docs/plugins/mcp
- https://better-auth.com/docs/plugins/oauth-provider
- https://better-auth.com/docs/plugins/agent-auth
- https://better-auth.com/docs/plugins/device-authorization
