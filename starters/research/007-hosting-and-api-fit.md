# 007 Hosting And API Fit

Status: second research pass.

## MCP TypeScript SDK

Sources:

- https://github.com/modelcontextprotocol/typescript-sdk
- https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md

Findings:

- The official TypeScript SDK supports server libraries for tools, resources,
  prompts, Streamable HTTP, stdio, and auth helpers.
- Server construction is conceptually simple: create an `McpServer`, register
  tools/resources/prompts, choose a transport, then connect.
- The server guide treats Streamable HTTP as the remote-server transport and
  stdio as the local process-spawned transport.
- Tool registration uses schemas, and structured content can be returned
  alongside text content.
- SDK docs emphasize tool annotations as hints and tool errors as model-visible
  self-correction inputs.

Starter implication:

- `mcp-agent` should start with hand-written tool registration, not generated
  wrappers.
- Remote MCP should target Streamable HTTP.
- A local/desktop-only recipe can target stdio separately.

## Convex Agent Package

Sources:

- https://docs.convex.dev/agents/overview
- https://docs.convex.dev/agents/tools
- https://docs.convex.dev/agents/tool-approval
- https://github.com/get-convex/agent
- https://github.com/get-convex/agent/blob/main/CHANGELOG.md

Findings:

- Convex Agent is the default persistence/runtime choice for threads, messages,
  context, tools, and streaming.
- Agent tools can be defined with Convex context through `createTool`.
- Tool context includes agent/thread/message/user details plus Convex action
  capabilities.
- Custom context can carry organization/workspace identity.
- Tool approval is native: tools can declare `needsApproval`, approval requests
  are persisted, and server functions can approve/deny/resume.
- The changelog confirms tool approval as an explicit package feature.

Starter implication:

- `vertical-ai` and `mcp-agent` should compose Convex Agent instead of creating
  a new agent state component.
- Starter approval should use Convex Agent approval for agent-internal tools
  where possible.
- Product canonicalization should still happen through normal Convex mutations
  with access checks and audit.

## better-convex-nuxt Server Fit

Local source:

- `src/runtime/server/utils/convex.ts`
- `src/runtime/server/index.ts`

Findings:

- `serverConvexQuery`, `serverConvexMutation`, and `serverConvexAction` execute
  Convex HTTP API calls from Nitro/H3.
- They support Better Auth session-cookie token exchange and an explicit
  `authToken` override.
- This is useful for Nuxt server routes acting as the current user.
- It is not sufficient by itself for service actors unless the Convex backend
  deliberately accepts that token format as auth or as a normal function arg.

Starter implication:

- User-session server routes can use existing server helpers.
- MCP service actors should not masquerade as Better Auth users.
- MCP/agent credentials should resolve to an app actor, then call Convex
  functions through explicit args or a deliberately minted short-lived backend
  token that Convex handlers validate.

## Nitro Versus Convex HTTP Actions For MCP

### Nitro Advantages

- Natural fit for Nuxt apps and `better-convex-nuxt` server helpers.
- Can share app runtime config, route middleware patterns, and deployment with
  the Nuxt frontend.
- Easier to integrate MCP SDK Node/HTTP examples if the deployment target has a
  Node server runtime.

### Nitro Risks

- Must not become an authorization authority.
- Needs careful deployment target validation for long-lived/streaming
  Streamable HTTP behavior.
- Needs its own rate limiting, CORS/origin, body limits, and audit forwarding.

### Convex HTTP Action Advantages

- Keeps MCP closer to Convex backend authority.
- Avoids a second server hop for product functions.
- Convex actions/functions can share backend code directly.

### Convex HTTP Action Risks

- The official MCP TypeScript SDK examples are Node/Express oriented; using them
  inside Convex HTTP actions may be awkward or impossible depending on stream
  primitives and runtime constraints.
- Convex components do not have `ctx.auth`; app HTTP actions would need to do
  caller resolution explicitly.
- Public MCP OAuth would be real auth infrastructure, not a tiny helper.

## Pass 2 Decision

Do not choose the final MCP host until a spike proves Streamable HTTP works
cleanly in the intended runtime.

Default implementation path for starters:

1. Hand-written Nuxt/Nitro MCP route spike for `mcp-agent`.
2. One read tool and one write tool.
3. Tool calls resolve service actor credentials.
4. Tool calls execute normal Convex functions.
5. Convex function re-checks actor/access and records audit.
6. Add approval only after the simple read/write path works.

Fallback:

- If Nitro streaming/session behavior is awkward, move MCP hosting to a
  dedicated Node server recipe or a Convex HTTP action spike.

## New Requirements

- `mcp-agent` must include a hosting decision note.
- `mcp-agent` must prove `tools/list` and `tools/call`, not only server startup.
- Tool handlers must return model-readable execution errors for fixable input
  problems.
- Tool handlers must not leak raw internal errors or sensitive data.
- Long-running tools must either use progress/task support or hand work off to
  Convex actions/workflows.
- Service actor credentials must be revocable and re-checked at execution time.

## Remaining Open Spike

Build the smallest MCP route spike before implementing a full starter:

```text
tools/list:
  projects.list

tools/call:
  projects.list
  projects.create
```

Acceptance:

- valid service actor can call both tools;
- revoked service actor fails;
- tool cannot target a different organization than its credential;
- Convex audit records actor, organization, tool/action, and result.
