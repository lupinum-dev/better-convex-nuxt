# AI Learnings

Research date: 2026-06-22.
External docs rechecked: 2026-06-23.

## Executive Verdict

Build AI as an opt-in SaaS Kit track, not as core `better-convex-nuxt` runtime.

This matches the accepted SaaS Kit direction: the core package stays an
integration library, while SaaS behavior ships as verified, editable templates
and recipes. Agents, MCP, and OAuth belong in optional recipe tracks until their
runtime boundaries are proven.

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

## Missing In Plain Terms

The local direction is strong enough to continue building the `agentic-saas`
track, but not strong enough to claim a finished SaaS Kit template yet.

What is still missing:

- Real provider execution: replace mock LLM paths only in a provider-enabled
  starter and prove provider-backed generation/streaming.
- Real project deployment: run the same browser approval flow against a
  configured Convex project, not only anonymous local Convex.
- Public OAuth/MCP: the current OAuth Provider package is mounted in a separate
  `platform-auth` proof and proves metadata, authenticated DCR, consent,
  authorization-code token exchange, userinfo, access-token introspection,
  revocation, revoked-token rejection, authenticated client-credentials
  issuance, resource-bound JWT access tokens, invalid resource rejection, and
  resource-client verification through both remote introspection and local
  JWKS. Do not recommend public MCP yet: refresh-token rotation currently fails
  against the Convex component because the provider filters `revoked eq null`
  while the Convex row omits optional `revoked`. A proof-only mutation that sets
  that field to explicit `null` makes the same refresh grant rotate correctly,
  so the remaining issue is the provider/adapter create/query contract, not
  token hashing, expiry, or client credentials. OAuth Provider's `mcpHandler`
  now proves token-to-handler gating for a `tools/call`-shaped request, and the
  Convex `/mcp` proof route writes product state through an internal mutation
  only after re-checking the Better Auth OAuth client row; authenticated
  undeclared tools return `Unknown tool` without creating product state. Nuxt
  MCP Toolkit tool execution and deployed runtime behavior are still not wired
  to these OAuth tokens.
- Deployed MCP backend: run the Nuxt MCP Toolkit route against a real Convex
  deployment. Local toolkit dispatch and direct adapter behavior are proven.
- Billing and rate limits: keep raw usage events and absolute token budgets for
  now; add invoices, rollups, background jobs, or Convex Rate Limiter only after
  concrete product requirements exist.
- Final docs/templates: the architecture direction now exists in
  `docs/content/docs/8.architecture/2.ai-agents-and-mcp.md`, but the shipped
  starter docs still need final provider/deployment claims once those proofs
  exist.

## Source Of Truth

| Concept                                   | Owner                                    | Rule                                                                                                                            |
| ----------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| User, session, organization, member, role | Better Auth local Convex component       | No app-owned mirrors in SaaS templates.                                                                                         |
| API key secrets and key ownership         | Better Auth API Key                      | Raw secrets never enter app tables. Product routes verify keys server-side.                                                     |
| OAuth clients, grants, access tokens      | Better Auth OAuth Provider, when enabled | Advanced platform recipe only. Must prove lifecycle before public claim.                                                        |
| Agent thread/message history              | Convex Agent component                   | Infrastructure only, not authorization authority.                                                                               |
| Agent run/delegation                      | App Convex table                         | The canonical record that says what an agent may do.                                                                            |
| Product data                              | App Convex tables                        | Store Better Auth organization ids as strings.                                                                                  |
| Product authorization                     | Convex product functions                 | Always re-check Better Auth/product invariants at execution time.                                                               |
| Product audit                             | App Convex table                         | Audit actor kind, delegating user where relevant, path, and resource.                                                           |
| Agent usage events                        | App Convex table                         | Internal append-only events from Convex Agent usage hooks, keyed by derived org/run/user plus normalized model/provider/tokens. |
| MCP transport and tool discovery          | Nuxt MCP Toolkit                         | Transport metadata only; never final authz.                                                                                     |

Implementation guide:

- User identity always comes from Better Auth. App code may store Better Auth
  user ids as strings on product/audit/delegation rows, but must not mirror
  user profiles or sessions into app tables.
- Organization identity and membership come from Better Auth Organization in
  the final SaaS Kit. App product rows store the Better Auth organization id as
  a string. The app must not add parallel `organizations`, `memberships`, or
  invitation tables in the Better Auth-backed starter.
- API keys should be Better Auth API Key records when the caller represents a
  user or organization integration in the final SaaS Kit. Product routes verify
  the key server-side and then still check the referenced organization and
  product permissions. Raw key secrets never enter product, audit, Agent, or MCP
  tables.
- Service actors are a private MCP/platform-auth recipe concept, not the
  default in-product agent model. If service actors survive into the final
  SaaS Kit, key them by Better Auth organization id and keep credential hashes
  separate from raw bearer secrets.
- Agent runs are app-owned because they are product delegation records, not
  auth-domain membership. They store `organizationId`, `startedByAuthUserId`,
  bounded capabilities, status, expiry, and budgets. They must be checked at
  every agent tool boundary. `active` runs are delegated but not yet executing;
  a checked Agent action claims the run exactly once as `running` before
  creating the Agent component thread or invoking tools. `completed` runs are
  readable history only and must not retain tool authority. Expiry and token
  budgets are creation-time invariants: do not insert already-expired runs or
  non-positive/fractional budget limits.
- Agent threads and messages live in the Convex Agent component. They are
  infrastructure history only. They do not authorize access by themselves, and
  UI reads must go through the app-owned `agentRuns` row.
- Product audit is app-owned immutable product history. Agent thread/message
  retention may delete conversational content, but product/audit history should
  remain unless a separate legal retention requirement says otherwise.
- MCP Apps and MCP tool annotations are client UX surfaces. They are not trusted
  backend clients and not authorization controls. Treat `readOnlyHint`,
  `destructiveHint`, app metadata, and `tools/list` visibility as hints only;
  Convex product functions remain the enforcement point.

## Agentic SaaS Shape

The core rule is that an agent never receives ambient authority. A user with a
Better Auth session starts a run. Convex verifies the user's organization
permission and stores an `agentRuns` row with bounded capabilities. A checked
Agent action later claims that row as `running`, creates the Convex Agent
component thread, attaches the real thread id once, and then executes tools.

Minimum app-owned schema:

```ts
agentRuns: defineTable({
  organizationId: v.string(),
  threadId: v.optional(v.string()),
  agentName: v.string(),
  status: v.union(
    v.literal('active'),
    v.literal('running'),
    v.literal('completed'),
    v.literal('revoked'),
    v.literal('failed'),
  ),
  startedByAuthUserId: v.string(),
  capabilities: v.array(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
  expiresAt: v.optional(v.number()),
  maxTotalTokens: v.optional(v.number()),
  maxOrganizationTotalTokens: v.optional(v.number()),
  maxUserTotalTokens: v.optional(v.number()),
})
  .index('by_thread', ['threadId'])
  .index('by_organization', ['organizationId'])
```

This table is not a second membership system. It is the app-owned delegation record for one run.

Target one product actor shape across UI, API keys, MCP, and agents, but only
add each actor kind when the recipe that uses it is present and tested. The
current `agentic-saas` proof exercises `user` and `agent`. The `service` shape
is proven separately in `mcp-agent`. `apiKey` and `system` are target extension
points, not proven `agentic-saas` requirements.

```ts
type ProductActor =
  | { kind: 'user'; authUserId: string }
  | {
      kind: 'agent'
      agentRunId: Id<'agentRuns'>
      delegatedByAuthUserId: string
    }
  | { kind: 'apiKey'; keyId: string; ownerAuthUserId?: string }
  | { kind: 'service'; serviceActorId: Id<'serviceActors'> }
  | { kind: 'system'; reason: string }
```

Agent tools should be thin adapters over normal product functions:

1. Load the `agentRuns` row.
2. Claim `status === "active"` exactly once as `running` before thread/tool
   side effects.
3. Bind organization, run, user, and credential authority from checked context,
   not model-visible tool arguments.
4. Require the delegated capability.
5. For sensitive writes, re-check the delegating user's current Better Auth
   membership and role permission from Better Auth's source of truth.
6. Call normal Convex product functions or shared product helpers.
7. Write audit with `actor.kind = "agent"` and `delegatedByAuthUserId`.

Default agent writes should create drafts or proposals, not canonical product state. Canonical destructive actions require approval.

## Convex Agent Findings

Convex Agent is the right foundation to compose before building anything ourselves.

Current Convex docs checked on 2026-06-23:

- <https://docs.convex.dev/agents/overview>
- <https://docs.convex.dev/agents/tool-approval>
- <https://docs.convex.dev/agents/usage-tracking>
- <https://docs.convex.dev/agents/rate-limiting>
- <https://docs.convex.dev/agents/workflows>

Current prerequisite check on 2026-06-23:

- no `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`,
  `GOOGLE_GENERATIVE_AI_API_KEY`, or `AI_GATEWAY_API_KEY` is present in the
  current shell, so real-provider generation/streaming cannot be proven here;
- no `CONVEX_DEPLOY_KEY`, `CONVEX_DEPLOYMENT`, `CONVEX_URL`, or
  `NUXT_PUBLIC_CONVEX_URL` is present in the current shell, and generated
  starter `.env.local` state is intentionally cleaned after validation, so
  configured project deployment remains unproven;
- no generated `starters/agentic-saas/.convex` or `.env.local` state is present
  after cleanup, so future anonymous-local Convex validation must recreate
  fresh generated state before it can be used as evidence.

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

Current spike result: `starters/mcp-agent` now hard-cuts from its handwritten
JSON-RPC route to `@nuxtjs/mcp-toolkit` on `/mcp`. Static file-discovered tools
still work with request-scoped bearer auth because the MCP SDK passes request
headers to tool handlers through request metadata. The toolkit docs warn not to
throw `401` from MCP middleware because many clients interpret that as a signal
to start OAuth discovery. The current spike therefore parses bearer auth
softly, stores the credential hash in request context, hides project tools from
unauthenticated listings with `enabled(event)`, and still hashes the bearer from
the tool-call request metadata before calling Convex. Convex still resolves the
service actor, credential status, organization, role, and approval on each
product function call.

The local toolkit source backs this split: `enabled(event)` is evaluated at
request time after middleware, thrown tool errors are normalized to MCP
`isError` results, annotations are explicitly client hints, and the toolkit
itself returns JSON 404 for OAuth discovery metadata because it does not
implement OAuth.

## Better Auth Findings

Better Auth remains the heavy-lifting auth layer.

Confirmed direction from existing research and current docs checked on
2026-06-22:

- Better Auth Organization owns organizations, members, invitations, roles, teams when enabled, and permission checks.
- `auth.api.hasPermission()` is the server-side permission check to use for
  product authorization. When checking organization-scoped product permissions,
  pass explicit `organizationId` and the product permission map; Convex product
  functions should call it before mutating product state.
- Organization dynamic roles work, but add `organizationRole` and admin UI complexity, so they are advanced.
- Organization-owned API keys work for service integrations, but product routes must also verify the referenced organization still exists.
- Better Auth local Convex component is required for schema-changing plugins.

For MCP/platform auth:

- the current Better Auth `mcp()` plugin docs say it will be deprecated in favor of OAuth Provider;
- the newer OAuth 2.1 Provider docs advertise MCP support, dynamic client registration, JWT/JWKS behavior, introspection, and revocation;
- the current OAuth Provider docs say prior MCP endpoints moved from `/mcp/*`
  to `/oauth2/*`, removed `/mcp/get-session`, and direct resources toward
  OAuth introspection/protected-resource handling;
- existing local research against installed packages found important limits in the older OIDC/MCP path: missing revoke/introspect, reusable old refresh tokens, no client credentials, advertised MCP userinfo/JWKS returning 404, and raw dynamic MCP client secrets.
- current package/runtime smoke research against
  `@better-auth/oauth-provider@1.6.20` shows the new package is not the same as
  the older OIDC/MCP plugin path. It exports `oauthProvider`,
  `oauthProviderClient`, `oauthProviderResourceClient`, `mcpHandler`,
  `oauthProviderAuthServerMetadata`, and
  `oauthProviderOpenIdConfigMetadata`. A temp runtime import with the package's
  peer set creates an `oauth-provider` plugin with 25 endpoints, including
  `oauth2Authorize`, `oauth2Token`, `oauth2Introspect`, `oauth2Revoke`,
  `registerOAuthClient`, `oauth2UserInfo`, and admin/client-management
  endpoints. The shipped code confirms a `client_credentials` token branch,
  resource/audience validation against configured valid audiences, Basic or
  body credentials for introspection, `/oauth2/introspect` and
  `/oauth2/revoke`, unauthenticated dynamic registration rejection for
  `client_credentials`, PKCE requirements for registered/public/offline-access
  clients, and a resource client that verifies JWT access tokens by JWKS or can
  remote-verify through introspection. This smoke proves package load and route
  surface; the separate `platform-auth` runtime proof covers the mounted
  Convex-backed authorization-code lifecycle and the refresh-token gap.
- the current OAuth Provider cannot be proven by simply mounting it beside the
  existing `team` starter OIDC/MCP experiments. The older plugin-generated
  schema uses `oauthApplication`, `oauthAccessToken`, and `oauthConsent`; the
  current package declares `oauthClient`, `oauthRefreshToken`,
  `oauthAccessToken`, and related fields with a different `oauthAccessToken`
  shape. That means the right proof is a hard-cut platform-auth spike with one
  OAuth stack, not a side-by-side compatibility path.
- npm was rechecked on 2026-06-22 and still reports
  `@better-auth/oauth-provider@1.6.20` as `latest` and `1.7.0-beta.9` as
  `beta`. The package is installed only in `starters/platform-auth`; the
  `team` starter should not be used as the runtime spike target because it
  already carries older OIDC/MCP experiments and explicitly excludes MCP/agent
  surfaces.

So the platform-auth recommendation is: do not ship public OAuth/MCP as a
default. Keep the current OAuth Provider in the separate `platform-auth` spike
until refresh rotation, resource verification, and MCP token use are proven.

`starters/platform-auth` is now that hard-cut spike. It mounts
`@better-auth/oauth-provider@1.6.20` with the Better Auth local Convex component
without the older OIDC/MCP schema. The mounted runtime proves authorization
server metadata, authenticated dynamic client registration, unauthenticated DCR
rejection, consent redirect/signature handling, PKCE authorization-code
exchange, hashed/prefixed client secrets, prefixed opaque access and refresh
tokens, EdDSA ID tokens through the Better Auth JWT plugin, userinfo,
access-token introspection, access-token revocation, and revoked-token
rejection. It also proves authenticated `client_credentials` registration and
token issuance for the non-OIDC `project:create` scope. Requesting the valid
resource `http://localhost:3000/mcp` returns a JWT access token with `aud`,
`azp`, `scope`, and `iss`; requesting an invalid resource fails with
`invalid_request`. The package resource-client helper can generate protected
resource metadata and verify that JWT through both remote introspection and the
advertised JWKS URI. The proof now mounts the protected-resource metadata at
`/.well-known/oauth-protected-resource/mcp`, returning the `http://localhost:3000/mcp`
resource, `http://localhost:3000/api/auth` authorization server, and
`project:create` scope. The package `mcpHandler` can also gate a
`tools/call`-shaped protected handler with the resource-bound JWT: the valid
token reaches the handler with `azp`, `aud`, and `scope`, missing auth returns
a `WWW-Authenticate` protected-resource challenge, and insufficient scope
returns `403` before the handler runs. The proof route at `/mcp` then shows the
same verified OAuth client can create app product state through an internal
Convex mutation. That mutation re-checks the Better Auth `oauthClient` row for
client existence, disabled status, `client_credentials`, and `project:create`
before writing. The proof sends spoofed product identity fields through the MCP
arguments and verifies product identity still comes from the OAuth JWT plus
server-generated Convex row id, while the Convex mutation normalizes and bounds
the project title. Invalid titles and authenticated unknown tools do not create
product state. Disabling the OAuth client after issuing the JWT makes the
still-valid JWT fail with `OAuth client is disabled` and does not create a
second product row. This is still not the full Nuxt MCP Toolkit integration.

The same proof captures one blocking runtime gap. Refresh-token rotation fails
with `invalid_grant` even though the hashed refresh-token row exists and is
unexpired. The provider rotates by updating the old row with `revoked eq null`;
the Convex component row omits optional `revoked`, and the Convex adapter's
manual equality filter uses strict `value === where.value`. This is a
provider/adapter/runtime contract issue, not an app-level permission problem.
Do not add a local shim in the SaaS Kit; resolve it upstream or in the adapter
before claiming public OAuth refresh support.

JWKS needed one small platform-auth route because Better Auth's generic JWT
plugin advertises `/jwks` in OAuth Provider metadata, while
`@convex-dev/better-auth` exposes the actual Convex-compatible JWKS endpoint at
`/convex/jwks` and overrides the generic JWT endpoint by endpoint id. The proof
starter now serves the advertised `/api/auth/jwks` by delegating to the existing
Convex plugin endpoint. This is a concrete OAuth metadata adapter, not a second
key source.

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

Convex Agent docs rechecked on 2026-06-22:

- The Agent component is the right owner for thread/message infrastructure,
  streaming, and conversation context. It is not a product authorization layer.
- Agent tools can be attached at the Agent, thread, or per-call level. The
  final tool set can therefore be constructed inside a checked action using
  the already-validated organization/run context instead of exporting a broad
  global tool registry.
- Tool calls and results are persisted into the Agent thread when messages are
  saved. This supports the current redaction rule: do not pass raw secrets
  through model-visible tool args or tool results.
- Convex Agent has a built-in tool approval flow where `needsApproval` pauses
  generation and persists approval-request messages in the thread, with
  `approveToolCall`/`denyToolCall` to resume. The current SaaS Kit proof
  deliberately uses app-owned `projectDrafts` and
  `projectDeletionRequests` instead, because product approval state must be
  queryable, auditable, and enforceable outside the chat transcript.
- Usage tracking belongs in a `usageHandler`; storing raw usage rows and
  generating invoices later is the documented shape. The proof follows the
  append-only raw usage event part and intentionally does not add invoice tables
  or billing crons yet.
- Rate limiting is a separate concern from absolute token budgets. The Convex
  docs demonstrate `@convex-dev/rate-limiter` for message frequency and
  time-window token throughput. `agentic-saas` currently proves absolute
  run/org/user token budgets from append-only usage events, not reactive
  time-window rate limits.

`starters/team/convex/projects.ts` is the current real Better Auth Organization
authorization pattern. It obtains Better Auth headers from the local component,
loads the Better Auth session, calls `auth.api.hasPermission()` for
`project:create` or `project:read`, and only then writes product rows. Do not
copy a mocked version of this into `agentic-saas`; the next proof should either
move the agent run-start flow onto this Better Auth starter or create a new
Better Auth-backed agentic starter.

`starters/agentic-saas` now exists as the isolated proof track for agent-first
SaaS invariants. It intentionally stays narrower than the final template: a
minimal Nuxt approval queue exists, but provider LLM generation, billing, MCP,
and public OAuth are still out. That is deliberate. Its current job is to prove
the app-owned delegation, live Better Auth Organization authorization, Convex
Agent thread/tool execution, browser approval flow, and draft/audit shape
without violating `team-saas` guardrails.

## Proof Ledger

Current local proof commands run on 2026-06-22 and refreshed on 2026-06-23:

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
pnpm convex:local:once
pnpm convex:codegen
pnpm feedback:better-auth-product-authz
pnpm feedback:better-auth-mcp-runtime
pnpm feedback:better-auth-oauth-provider-surface
pnpm feedback:oauth-provider-runtime
pnpm view @better-auth/oauth-provider version dist-tags --json
npm pack @better-auth/oauth-provider@1.6.20
npm install @better-auth/oauth-provider@1.6.20 better-auth@1.6.20 @better-auth/core@1.6.20 @better-auth/utils@0.4.2 @better-fetch/fetch@1.3.1 better-call@1.3.6
```

in:

- `starters/agentic-saas`
- `starters/mcp-agent`
- `starters/vertical-ai`
- `starters/team`
- `starters/platform-auth`

Results:

- 2026-06-23 proof refresh: `starters/agentic-saas` still passes
  `pnpm test` (1 file, 32 tests), `pnpm typecheck`, `pnpm build`, and
  `pnpm convex:local:once`.
- 2026-06-23 focused refresh: after removing model-controlled authority fields
  from the Agent draft tool input, `starters/agentic-saas` still passes
  `pnpm test` (1 file, 32 tests) and `pnpm typecheck`.
- 2026-06-23 focused refresh: after deleting the public retention `threadId`
  argument and deriving cleanup from the stored terminal run thread id,
  `starters/agentic-saas` still passes `pnpm test` (1 file, 32 tests) and
  `pnpm typecheck`.
- 2026-06-23 focused refresh: after deleting public message/stream `threadId`
  arguments and deriving reads from the stored `agentRuns.threadId`,
  `starters/agentic-saas` still passes `pnpm test` (1 file, 32 tests) and
  `pnpm typecheck`.
- 2026-06-23 focused refresh: after requiring public Agent execution actions to
  run under the delegating Better Auth session and keeping auth-denied attempts
  from failing active runs, `starters/agentic-saas` still passes `pnpm test`
  (1 file, 32 tests) and `pnpm typecheck`.
- 2026-06-23 focused refresh: after making agent-only
  `projectDrafts.createFromAgent` and `projectDeletionRequests.createFromAgent`
  internal mutations, `starters/agentic-saas` still passes `pnpm test` (1 file,
  32 tests) and `pnpm typecheck`.
- 2026-06-23 focused refresh: after adding source-level proof that
  `projectDrafts.createFromAgent` and `projectDeletionRequests.createFromAgent`
  stay `internalMutation`s instead of public mutations, `starters/agentic-saas`
  passes `pnpm test` (1 file, 43 tests) and `pnpm typecheck`.
- 2026-06-23 focused refresh: after adding source-level proof that
  `agentic-saas` has no real provider SDK dependency or provider API-key env
  access while provider execution is unproven, the starter remains explicitly
  mock-only. The guard now scans direct dependencies and runtime sources for
  real-provider imports/env keys; `starters/agentic-saas` passes `pnpm test` (1
  file, 44 tests) and `pnpm typecheck`.
- 2026-06-23 focused refresh: `starters/agentic-saas` passes `pnpm build`,
  fresh anonymous-local `pnpm convex:local:once`, and `pnpm convex:codegen`.
  The first Convex validation attempt against reused local `.convex` state
  failed on stale `agentAuditEvents.outcome` rows from an older schema; deleting
  generated `.convex`/`.env.local` and rerunning proved the current backend.
- 2026-06-23 direction audit: the accepted SaaS Kit direction still matches
  the current proof shape. The concise architecture page now records
  `agentic-saas` build/Convex/codegen validation, and the starter README keeps
  finite validation commands separate from the long-running `pnpm dev` runtime
  proof command.
- 2026-06-23 focused refresh: after adding source-level proof that public
  existing-run agent execution, revocation, message read, stream read, and
  retention cleanup surfaces stay keyed by `agentRunId` and reject
  caller-supplied organization, thread, user, and token args,
  `starters/agentic-saas` passes `pnpm test` (1 file, 45 tests) and
  `pnpm typecheck`.
- 2026-06-23 focused refresh: after adding source-level proof that human
  approval mutations route canonical `productRecords` create/delete side
  effects through `productRecords.ts` helpers instead of inline writes,
  `starters/agentic-saas` passes `pnpm test` (1 file, 46 tests) and
  `pnpm typecheck`.
- 2026-06-23 focused refresh: after adding source-level proof that human
  approval/rejection mutations are keyed only by the review row id, not
  caller-supplied organization or user identity, `starters/agentic-saas` passes
  `pnpm test` (1 file, 47 tests) and `pnpm typecheck`.
- 2026-06-23 focused refresh: after adding source-level proof that production
  Convex source contains no `sessionTokenForTest`,
  `ALLOW_AGENTIC_SAAS_PROOF_TOKENS`, or `sourceToken` markers, the Better Auth
  identity cutover remains outside public Convex args; `starters/agentic-saas`
  passes `pnpm test` (1 file, 48 tests) and `pnpm typecheck`.
- 2026-06-23 focused refresh: after adding a schema allowlist that keeps
  app-owned state to `agentRuns`, review/product/audit rows, and raw
  `agentUsageEvents`, the starter remains free of billing rollups, projections,
  caches, and invoice tables; `starters/agentic-saas` passes `pnpm test`
  (1 file, 49 tests) and `pnpm typecheck`.
- 2026-06-23 focused refresh: after adding source-level proof that Agent
  component thread creation uses `agentRuns.startedByAuthUserId` instead of
  caller/model-supplied user ids, `starters/agentic-saas` passes `pnpm test`
  (1 file, 50 tests) and `pnpm typecheck`.
- 2026-06-23 focused refresh: after adding an explicit `running` run status and
  a Better Auth-checked one-shot execution claim before Agent component thread
  creation, duplicate execution attempts fail before drafts, usage, or thread
  side effects; `starters/agentic-saas` passes `pnpm test` (1 file, 51 tests).
- 2026-06-23 focused refresh: after proving the execution claim re-checks the
  delegating user's current Better Auth permission, a draft-capable run created
  before role downgrade or membership removal cannot even claim execution after
  the permission change and leaves no Agent thread, draft, audit, or usage side
  effects; `starters/agentic-saas` passes `pnpm test` (1 file, 54 tests) and
  `pnpm typecheck`.
- 2026-06-23 focused refresh: after proving expired active delegations fail at
  execution claim time, expiry blocks Agent thread creation, draft/audit writes,
  and usage without adding a separate expired status; `starters/agentic-saas`
  passes `pnpm test` (1 file, 55 tests) and `pnpm typecheck`.
- 2026-06-23 focused refresh: after tightening agent-created draft/request
  helpers to require a `running` run with an attached Agent component thread,
  active or threadless runs cannot create review rows or agent audit rows;
  `starters/agentic-saas` passes `pnpm test` (1 file, 52 tests).
- 2026-06-23 focused refresh: after extending the public revocation proof,
  a run revoked by its delegating Better Auth user cannot later execute and
  leaves no Agent thread, draft, audit, or usage side effects;
  `starters/agentic-saas` passes `pnpm test` (1 file, 54 tests) and
  `pnpm typecheck`.
- 2026-06-23 focused refresh: after making `failRun` reject pending
  draft/deletion-request rows for that run, failed Agent executions no longer
  leave human-approvable review state behind; `starters/agentic-saas` passes
  `pnpm test` (1 file, 53 tests).
- 2026-06-23 focused refresh: after extending the failed-run review test with
  mixed pending and already-decided rows, `failRun` only auto-rejects still
  pending rows and leaves prior rejection decisions plus canonical product
  records untouched; `starters/agentic-saas` passes `pnpm test` (1 file,
  53 tests) and `pnpm typecheck`.
- 2026-06-23 focused refresh: after extending the real over-budget Agent path
  through retention cleanup, failed terminal runs with a stored Agent thread can
  delete conversation and usage history while preserving rejected review rows;
  `starters/agentic-saas` passes `pnpm test` (1 file, 53 tests) and
  `pnpm typecheck`.
- 2026-06-23 focused refresh: after proving the same terminal retention action
  can be called twice, cleanup is retryable without extra state: the first call
  deletes Agent messages plus usage events, and the second call reports zero
  remaining messages/usage while preserving product and audit rows;
  `starters/agentic-saas` passes `pnpm test` (1 file, 53 tests) and
  `pnpm typecheck`.
- 2026-06-23 focused refresh: after requiring `agentUsageEvents.threadId` to
  match the canonical `agentRuns.threadId` and rejecting empty Agent thread ids,
  `starters/agentic-saas` passes `pnpm test` (1 file, 33 tests) and
  `pnpm typecheck`.
- 2026-06-23 focused refresh: after enforcing at most one pending destructive
  deletion request per canonical product record, `starters/agentic-saas` passes
  `pnpm test` (1 file, 34 tests) and `pnpm typecheck`.
- 2026-06-23 focused refresh: after rejecting blank agent run names and storing
  deduplicated capabilities in stable canonical order on `agentRuns` rows,
  `starters/agentic-saas` passes `pnpm test` (1 file, 35 tests) and
  `pnpm typecheck`.
- 2026-06-23 focused refresh: after making public run revocation active-only so
  completed runs remain terminal readable history, `starters/agentic-saas`
  passes `pnpm test` (1 file, 36 tests) and `pnpm typecheck`.
- 2026-06-23 focused refresh: after deriving usage identity from `agentRuns`
  and rejecting negative/non-integer usage token counts, `starters/agentic-saas`
  still passes `pnpm test` (1 file, 36 tests) and `pnpm typecheck`.
- 2026-06-23 focused refresh: after requiring `totalTokens` to cover prompt
  plus completion tokens, `starters/agentic-saas` still passes `pnpm test` (1
  file, 36 tests) and `pnpm typecheck`.
- 2026-06-23 focused refresh: after proving a user authorized in one
  organization cannot approve or reject draft/deletion request ids from another
  organization, `starters/agentic-saas` passes `pnpm test` (1 file, 37 tests)
  and `pnpm typecheck`.
- 2026-06-23 focused refresh: after proving blank agent-created draft content
  and deletion reasons are rejected before inserting review rows or agent audit
  events, `starters/agentic-saas` passes `pnpm test` (1 file, 38 tests) and
  `pnpm typecheck`.
- 2026-06-23 focused refresh: after proving already-decided draft and deletion
  request rows cannot be approved or rejected again, `starters/agentic-saas`
  still passes `pnpm test` (1 file, 38 tests) and `pnpm typecheck`.
- 2026-06-23 focused refresh: after deleting unused `agentAuditEvents`
  `outcome`/`reason` fields, successful agent product actions still produce
  audit rows and `starters/agentic-saas` still passes `pnpm test` (1 file, 38
  tests) and `pnpm typecheck`.
- 2026-06-23 focused refresh: after replacing loose audit action/resource
  strings with schema-bounded product and agent audit labels, invalid audit
  action/resource inserts are rejected and `starters/agentic-saas` passes
  `pnpm test` (1 file, 39 tests) and `pnpm typecheck`.
- 2026-06-23 focused refresh: after making retained product and agent audit
  resource ids required, missing-resource audit inserts are rejected, every
  audit row points at a concrete resource, and `starters/agentic-saas` passes
  `pnpm test` (1 file, 40 tests) and `pnpm typecheck`.
- 2026-06-23 focused refresh: after making agent audit for
  `projectDeletionRequests.create` point at the created deletion-request row
  instead of duplicating the target product record, retained agent audit has a
  direct review-resource pointer and `starters/agentic-saas` still passes
  `pnpm test` (1 file, 42 tests) and `pnpm typecheck`.
- 2026-06-23 focused refresh: after proving human rejection audit rows for
  drafts and deletion requests point at the decided review row and matching
  source id, `starters/agentic-saas` still passes `pnpm test` (1 file, 42
  tests) and `pnpm typecheck`.
- 2026-06-23 focused refresh: after removing callback-supplied usage
  `agentName` and `userId` inputs and making stored usage identity required
  derived state from `agentRuns`, `starters/agentic-saas` still passes
  `pnpm test` (1 file, 38 tests) and `pnpm typecheck`.
- 2026-06-23 focused refresh: after deleting duplicate usage `userId` and
  keeping `startedByAuthUserId` as the single stored user attribution field,
  `starters/agentic-saas` still passes `pnpm test` (1 file, 38 tests) and
  `pnpm typecheck`.
- 2026-06-23 focused refresh: after deleting duplicate usage `agentName` and
  keeping display names on `agentRuns`, `starters/agentic-saas` still passes
  `pnpm test` (1 file, 38 tests) and `pnpm typecheck`.
- 2026-06-23 focused refresh: after adding runtime proof that
  `agentUsage.recordUsage` rejects old-shape `organizationId`,
  `startedByAuthUserId`, and `agentName` callback metadata, usage identity and
  display names stay derived from `agentRuns`; `starters/agentic-saas` still
  passes `pnpm test` (1 file, 56 tests) and `pnpm typecheck`.
- 2026-06-23 focused refresh: after rejecting cached input token counts greater
  than prompt tokens, `starters/agentic-saas` still passes `pnpm test` (1 file,
  38 tests) and `pnpm typecheck`.
- 2026-06-23 focused refresh: after deleting caller-supplied organization ids
  from approval/rejection mutations and deriving decision authorization from
  canonical draft/deletion request rows, hostile old-shape calls with an
  `organizationId` field still cannot decide cross-organization rows, and
  `starters/agentic-saas` still passes `pnpm test` (1 file, 38 tests) and
  `pnpm typecheck`.
- 2026-06-23 focused refresh: after adding runtime proof that draft
  approval/rejection and destructive approval/rejection reject old-shape
  `approvedByAuthUserId`, `deletedByAuthUserId`, and `rejectedByAuthUserId`
  fields, caller-supplied human actor ids cannot mutate review rows, product
  records, or product audit; `starters/agentic-saas` still passes `pnpm test`
  (1 file, 56 tests) and `pnpm typecheck`.
- 2026-06-23 focused refresh: after deleting caller-supplied organization ids
  from public agent execution, revocation, message/stream read, and retention
  cleanup surfaces, those operations derive organization from `agentRuns`,
  old-shape calls with `organizationId` are rejected by Convex arg validation,
  and `starters/agentic-saas` still passes `pnpm test` (1 file, 38 tests) and
  `pnpm typecheck`.
- 2026-06-23 focused refresh: after deleting helper-supplied organization ids
  from agent-created draft and deletion request helpers, review rows derive
  organization from `agentRuns` or the target product record, old-shape helper
  calls with `organizationId` are rejected by Convex arg validation, and
  `starters/agentic-saas` still passes `pnpm test` (1 file, 38 tests) and
  `pnpm typecheck`.
- 2026-06-23 focused refresh: after deleting the unused
  `agentRuns.assertRunCapability` internal query, cross-organization agent tool
  denial is proven through the actual deletion-request helper instead of a
  test-only guard export, and `starters/agentic-saas` still passes `pnpm test`
  (1 file, 38 tests) and `pnpm typecheck`.
- 2026-06-23 focused refresh: after deleting callback-supplied organization ids
  from Agent usage budget, record, and retention cleanup helpers, usage events
  and token budgets derive organization from `agentRuns`, old-shape usage calls
  with `organizationId` are rejected by Convex arg validation, and
  `starters/agentic-saas` still passes `pnpm test` (1 file, 38 tests) and
  `pnpm typecheck`.
- 2026-06-23 focused refresh: after deleting the internal usage cleanup
  `threadId` argument, app usage-event retention cleanup derives the component
  thread id from `agentRuns`; old-shape cleanup calls with `threadId` are
  rejected by Convex arg validation, and `starters/agentic-saas` still passes
  `pnpm test` (1 file, 38 tests) and `pnpm typecheck`.
- 2026-06-23 focused refresh: after narrowing retention helpers further,
  `getThreadForRetention` returns only the stored component thread id and usage
  cleanup queries events by canonical `agentRunId` before checking the derived
  organization/thread pair; `starters/agentic-saas` still passes `pnpm test`
  (1 file, 38 tests) and `pnpm typecheck`.
- 2026-06-23 focused refresh: after making internal app usage cleanup reject
  non-terminal runs before checking thread state, retention safety no longer
  depends only on the public retention action ordering or prior thread
  attachment, and `starters/agentic-saas` passes `pnpm test` (1 file, 42 tests)
  and `pnpm typecheck`.
- 2026-06-23 focused refresh: after making usage recording store
  `threadId` from `agentRuns` instead of the callback argument, the callback
  thread id is only validation input; `starters/agentic-saas` still passes
  `pnpm test` (1 file, 38 tests) and `pnpm typecheck`.
- 2026-06-23 focused refresh: after requiring normalized non-empty usage
  `model` and `provider` labels before appending raw usage events,
  `starters/agentic-saas` still passes `pnpm test` (1 file, 38 tests) and
  `pnpm typecheck`.
- 2026-06-23 focused refresh: after making usage recording reject expired
  active runs, usage cannot accrue after delegation expiry and
  `starters/agentic-saas` passes `pnpm test` (1 file, 41 tests) and
  `pnpm typecheck`.
- 2026-06-23 focused refresh: after requiring a stored Agent thread before
  marking a run `completed`, successful terminal history always has a canonical
  thread and `starters/agentic-saas` passes `pnpm test` (1 file, 42 tests) and
  `pnpm typecheck`.
- 2026-06-23 focused refresh: after normalizing stored Agent thread ids at the
  `agentRuns.attachThread` write point, the canonical conversation join key is
  trimmed and attached once; `starters/agentic-saas` still passes `pnpm test`
  (1 file, 42 tests) and `pnpm typecheck`.
- 2026-06-23 focused refresh: after making `agentRuns.attachThread` reject
  expired running delegations, an expired run cannot gain a canonical Agent
  thread id after claim; `starters/agentic-saas` still passes `pnpm test` (1
  file, 56 tests) and `pnpm typecheck`.
- 2026-06-23 focused refresh: after making expiry gate active delegation only,
  completed runs remain readable history even after `expiresAt`;
  `starters/agentic-saas` still passes `pnpm test` (1 file, 36 tests) and
  `pnpm typecheck`.
- 2026-06-23 focused refresh: after source-guarding `agentic-saas` against
  MCP/public OAuth transport leakage, `starters/agentic-saas` passes `pnpm test`
  (1 file, 57 tests), `pnpm typecheck`, and `pnpm build`.
- 2026-06-23 focused refresh: after source-guarding `agentic-saas` audit actors
  against unproven `apiKey`, `service`, and `system` variants,
  `starters/agentic-saas` passes `pnpm test` (1 file, 58 tests),
  `pnpm typecheck`, and `pnpm build`.
- 2026-06-23 proof refresh: `starters/mcp-agent` still passes `pnpm test`
  (4 files, 39 tests), `pnpm typecheck`, and `pnpm build`; the focused suite
  now proves service actor credential issuance and revocation are active
  owner/admin-only operations keyed by the stored organization, service actors
  cannot use the human `owner` role, issuance accepts only SHA-256 hex digests,
  duplicate credential hashes are rejected before service actor insert, and the
  old unauthenticated demo minting path is gone. Destructive approval creation
  no longer has a demo bypass; it derives organization from the target project,
  requires an active owner/admin membership, and records the approving human.
  The unused caller-supplied fake agent usage action is deleted and guarded
  against because MCP service actors should not create a second usage source of
  truth.
- 2026-06-23 proof refresh: `starters/platform-auth` still passes
  `pnpm typecheck`, `pnpm convex:local:once`, and the full
  `pnpm feedback:oauth-provider-runtime` lifecycle when `pnpm convex:dev` is
  running with `SITE_URL=http://localhost:3000` and the local Better Auth
  secret. The runtime proof includes the authenticated unknown MCP tool no-write
  check, verifies spoofed MCP product identity arguments are ignored, verifies
  invalid MCP project titles do not write product state, source-guards the hard
  cut to the current `@better-auth/oauth-provider` schema instead of deprecated
  `mcp()`/`oidcProvider()` plugin tables,
  source-guards the app schema against mirroring Better Auth user/session/member
  or OAuth client/token state, and derives expected OAuth resource audiences
  from `SITE_URL` instead of hardcoding `http://localhost:3000/mcp`.
- 2026-06-23 proof refresh: `starters/team` still passes `pnpm typecheck` and
  `pnpm feedback:better-auth-oauth-provider-surface`; npm still reports
  `@better-auth/oauth-provider@1.6.20` as `latest` and `1.7.0-beta.9` as
  `beta`.
- 2026-06-23 proof refresh: `starters/vertical-ai` still passes
  `pnpm typecheck` and `pnpm build`.
- 2026-06-23 proof refresh: `docs` passes `pnpm lint`, `pnpm typecheck`, and
  `pnpm build` only when run with the bundled Node 24 runtime used to install native
  dependencies. Running `docs` build with system Node 26 fails because
  `better-sqlite3` was compiled for a different Node ABI; that is an
  environment/runtime mismatch, not an architecture-page failure.
- 2026-06-23 proof refresh: repository root `pnpm lint` exits zero after
  cleaning generated starter artifacts from the local proof runs. The root
  `check:no-starter-generated-artifacts` gate rejects starter `node_modules`,
  `.nuxt`, `.output`, `.env.local`, `.agents`, `.claude`, `CLAUDE.md`, and
  `skills-lock.json` payloads even when they are ignored by Git.
- 2026-06-23 proof refresh: repository root `npm run check:contracts` and
  `npm run test:types` exit zero. The consumer smoke fixture caught the one
  runtime typing gap: injected `$convexAuthEngine` is seen as `unknown` by the
  fixture unless `useConvexAction` and `useConvexMutation` pass it to
  `ensureConvexAuthReady` as `ConvexAuthEngine | undefined`.
- 2026-06-23 proof refresh: `git diff --check` exits zero. Repository-wide
  `npm run format:check` still fails across broad existing/docs/starter files,
  and blindly running `oxfmt` conflicts with docs ESLint formatting. Treat this
  as a separate formatter-policy cleanup before claiming a fully green root
  formatting gate.

- `starters/agentic-saas`: `pnpm test` passes; 1 test file, 32 tests after
  deleting public proof-token auth args and moving the session-token mapping
  into the `convex-test` harness.
- `starters/agentic-saas`: `pnpm typecheck` exits zero after the public auth
  argument cutover.
- `starters/agentic-saas`: `pnpm build` exits zero.
- `starters/agentic-saas`: `pnpm convex:local:once` exits zero. The local
  Convex backend installs the `agent` and `betterAuth` components and reports
  Convex functions ready.
- `starters/agentic-saas`: `pnpm convex:codegen` exits zero after the
  anonymous local deployment writes `.env.local`.
- `starters/agentic-saas`: `pnpm dev --host 127.0.0.1 --port 3037`
  renders the Nuxt approval queue page.
- `starters/agentic-saas`: local browser proof passes against anonymous Convex
  plus Nuxt on `127.0.0.1`: sign up through the Nuxt `/api/auth` proxy, create
  a Better Auth organization, start a delegated Agent draft run from the page,
  list the pending draft in the approval queue, approve it from the page, and
  verify `productRecords`, `projectDrafts`, `productAuditEvents`, and
  `agentAuditEvents` contain the expected canonical rows.
- `starters/mcp-agent`: `pnpm test` passes after adding `nuxi prepare` to the script; 4 test files, 20 tests.
- `starters/vertical-ai`: `pnpm test` passes after adding `nuxi prepare` to the script; 1 test file, 4 tests.
- `starters/mcp-agent`: `pnpm typecheck` exits zero.
- `starters/vertical-ai`: `pnpm typecheck` exits zero.
- `starters/mcp-agent`: `pnpm build` exits zero.
- `starters/vertical-ai`: `pnpm build` exits zero.
- `starters/team`: `pnpm test` passes; 1 test file, 2 tests.
- `starters/team`: `pnpm typecheck` exits zero.
- `starters/team`: `pnpm feedback:better-auth-product-authz` passes against
  local Convex. This hard-resets the Better Auth component, signs up owner,
  member, viewer, and outsider users, creates a Better Auth organization,
  accepts invitations, proves owner/member can create product rows, proves
  viewer can read but not create, proves outsider cannot read or create, and
  inspects app plus Better Auth component tables.
- `starters/team`: `pnpm feedback:better-auth-mcp-runtime` passes against
  local Convex for the deprecated Better Auth `mcp()` path. It proves discovery
  metadata, protected-resource metadata, dynamic client registration,
  auth-code consent, token exchange, `/mcp/get-session`, and component table
  writes. It also re-confirms the old path's limits: advertised MCP
  userinfo/JWKS endpoints return 404 and dynamic MCP client secrets are stored
  raw in `oauthApplication`.
- `starters/team`: `pnpm feedback:better-auth-oauth-provider-surface` passes.
  This verifier fetches `@better-auth/oauth-provider@1.6.20` into a temp
  directory, asserts npm still reports it as `latest`, checks the tarball
  exports and endpoint names, instantiates the plugin with
  `authorization_code`, `refresh_token`, and `client_credentials`, confirms 25
  runtime endpoints including introspection and revocation, and asserts the
  current package schema conflicts with the older team OIDC/MCP schema. It does
  not mount the plugin against Convex.
- `@better-auth/oauth-provider`: npm reports `1.6.20` as the current `latest`
  and `1.7.0-beta.9` as `beta`; `npm pack @better-auth/oauth-provider@1.6.20`
  exposes the package exports and route/type surface summarized below.
- `@better-auth/oauth-provider`: a temp runtime import against the installed
  peer set creates the `oauth-provider` plugin and exposes 25 endpoints:
  authorization, token, introspection, revocation, userinfo, dynamic
  registration, consent, logout, and client-management endpoints. The smoke
  also verifies that `mcpHandler`, authorization-server metadata helpers, the
  OAuth client plugin, and the resource-client plugin are callable exports.
- `@better-auth/oauth-provider`: tarball type inspection shows the current
  package declares `oauthClient`, `oauthRefreshToken`, and an
  `oauthAccessToken` table shape with `token`/`refreshId` fields. The existing
  `team` starter schema was generated for the older OIDC/MCP plugins and uses
  `oauthApplication` plus a different `oauthAccessToken` shape with
  `accessToken`/`refreshToken`. This blocks a side-by-side proof in `team` and
  is why the next OAuth Provider proof should be a separate hard-cut
  `platform-auth` spike.
- `@better-auth/oauth-provider`: runtime instantiation found one option
  invariant worth documenting for the future spike: `disableJwtPlugin: true`
  cannot be combined with hashed client secrets, because HS256 id tokens need
  decryptable client secrets. Keep the recommended hashed storage path with the
  JWT plugin unless a specific opaque-token-only design proves a different
  storage mode.
- `starters/platform-auth`: `pnpm typecheck` exits zero after aligning the
  package `tsconfig.json` with Convex's `ESNext`/`Bundler` import style.
- `starters/platform-auth`: `pnpm convex:local:once` exits zero and installs
  the Better Auth component with the current OAuth Provider table shape.
- `starters/platform-auth`: `pnpm feedback:oauth-provider-runtime` passes
  against anonymous local Convex after starting `pnpm convex:dev`. It proves
  mounted authorization-server metadata, unauthenticated dynamic registration
  rejection, email signup, authenticated dynamic registration, consent redirect
  and acceptance, PKCE authorization-code exchange, prefixed opaque access
  tokens, prefixed refresh tokens, prefixed hashed client secrets, EdDSA ID
  tokens, userinfo, active access-token introspection, access-token revocation,
  revoked-token introspection rejection, authenticated client-credentials
  registration, client-credentials token exchange, resource-bound JWT access
  tokens for `http://localhost:3000/mcp`, invalid resource rejection, protected
  resource metadata generation, and package resource-client verification through
  remote introspection and local JWKS.
- `starters/platform-auth`: the same runtime proof intentionally asserts the
  current refresh-token rotation failure. The refresh token hashes to the stored
  row, the row is unexpired, and `revoked` is absent. The pinned provider then
  attempts rotation with `revoked eq null`, while the Convex adapter equality
  path treats absent and null as different values. The result is
  `invalid_grant` with `invalid refresh token`.
- `starters/platform-auth`: the proof then applies a proof-only mutation that
  sets the same refresh-token row's `revoked` field to explicit `null`. The
  same refresh grant succeeds, returns a new prefixed refresh token and access
  token, marks the old row revoked, and creates a new active refresh row that
  again omits `revoked`. This proves the refresh failure is exactly the
  missing-vs-null contract between the provider and Convex adapter. It is not a
  SaaS Kit product shim recommendation.
- `starters/platform-auth`: the same runtime proof now verifies the advertised
  OAuth Provider JWKS URI. `convex/http.ts` serves `/api/auth/jwks` by
  delegating to Better Auth Convex's existing `/api/auth/convex/jwks` endpoint,
  the route returns at least one EdDSA key, and the resource client verifies the
  resource-bound JWT locally through that JWKS.
- `starters/platform-auth`: the same runtime proof now mounts and verifies the
  MCP protected-resource metadata URL advertised by `WWW-Authenticate`.
  `/.well-known/oauth-protected-resource/mcp` returns the MCP resource,
  authorization server, and supported scope expected by OAuth clients.
- `starters/platform-auth`: the same runtime proof now exercises OAuth
  Provider's `mcpHandler` with the resource-bound client-credentials JWT. A
  `tools/call`-shaped request with the valid token reaches the handler and
  exposes the OAuth client as `jwt.azp`; a request without auth returns `401`
  plus `WWW-Authenticate:
Bearer resource_metadata="http://localhost:3000/.well-known/oauth-protected-resource/mcp"`;
  a request with the valid token but missing the required scope returns `403`
  and does not run the handler.
- `starters/platform-auth`: the Convex HTTP `/mcp` route now uses the same
  OAuth Provider token gate to call an internal product mutation. The verifier
  posts a real `tools/call`-shaped `projects.create` request, confirms the
  `oauthProjects` row is written with `createdByOAuthClientId`, calls an
  authenticated unknown tool and confirms no second row is created, disables the
  OAuth client in the Better Auth component, retries with the same unexpired JWT,
  receives `403`, and confirms no second product row is created.
- `starters/platform-auth`: the product mutation now compares the JWT `aud`
  against `${SITE_URL}/mcp` instead of a hardcoded localhost audience. This
  removes one local-only blocker before deployed proof. A failed attempt to move
  `auth.config.ts` to `process.env.SITE_URL` showed a separate Convex constraint:
  env vars referenced from the auth config file must exist in the Convex
  deployment env before `convex dev` prepares functions; shell env alone was not
  accepted for anonymous local dev. The runtime verifier now guards that
  `auth.config.ts` stays static in this proof until a deployed recipe explicitly
  sets Convex env.
- `starters/platform-auth`: the runtime verifier now fails early if the starter
  stops being a hard-cut current OAuth Provider proof. It asserts the
  `@better-auth/oauth-provider@1.6.20` dependency pin, verifies
  `convex/auth.ts` mounts `oauthProvider()`, rejects deprecated
  `oidcProvider()`/`mcp()` plugin calls, rejects old `oauthApplication*` table
  keys, and requires the current `oauthClient`, `oauthRefreshToken`,
  `oauthAccessToken`, and `oauthConsent` tables. The same guard requires the
  app-owned schema to keep product state in `oauthProjects` and reject app-owned
  mirrors of Better Auth user, session, organization, member, OAuth client, and
  OAuth token tables.
- `starters/platform-auth`: the mounted consent flow initially logged a Convex
  warning for `oauthConsent` lookup by `clientId` plus `userId`. The proof
  schema now includes a compound `clientId_userId` index, and the runtime
  verifier passes without that warning.

What those tests prove:

- `agentic-saas` proves the agent-first app data shape without adding app-owned organization/member mirrors: Better Auth Organization is wired through a local Better Auth component, `agentRuns` are bounded delegation records keyed by Better Auth ids as strings, delegated run start has a check-before-insert contract for Better Auth-style organization permissions, blank run names and invalid run expiry/token budgets are rejected before insert, duplicate capabilities are deduplicated before storage and permission checks, live Better Auth `hasPermission()` lets an organization owner start a delegated run, outsider permission failure does not create a run, denied or mismatched permission checks do not create runs, public run start is Better Auth-backed, production Convex and Nuxt app source are source-guarded against proof-token auth markers, caller-supplied delegating user ids are rejected, public operations on an existing run derive organization from `agentRuns` instead of accepting caller-supplied organization ids, only the delegating Better Auth user can revoke their own active run, completed runs cannot be revoked because they are terminal readable history, Agent actions derive thread user and usage attribution from `agentRuns.startedByAuthUserId` instead of caller input, public Agent execution requires the current Better Auth session to be the delegating user, unauthorized execution attempts do not fail active runs, Agent tool input carries product content only while `organizationId` and `agentRunId` are bound from the checked action context, agent-only draft/request helpers are internal mutations, tool calls reject wrong organizations, missing capabilities, revoked runs, and expired runs, default writes create `projectDrafts` whose organization comes from `agentRuns`, blank agent-created draft content is rejected before inserting draft or agent audit rows, Better Auth-checked human approval derives the authorization organization from the draft row, promotes drafts into canonical `productRecords`, unauthorized approval leaves drafts pending, cross-organization draft ids cannot be approved or rejected by a user authorized only in another organization, already-decided drafts cannot be approved or rejected again, approval queue reads require Better Auth `project:read` before returning pending drafts or deletion requests, destructive agent actions create `projectDeletionRequests` whose organization comes from the target product record instead of directly deleting records, blank deletion reasons are rejected before inserting request or agent audit rows, destructive agent tools re-check the delegating user's current Better Auth membership and configured role before creating requests, duplicate pending deletion requests for the same product record are rejected, downgrade or removal after delegation blocks future destructive tool calls, Better Auth-checked destructive approval derives the authorization organization from the deletion request row and deletes only after authorization, unauthorized destructive approval leaves product records intact, cross-organization deletion request ids cannot be approved or rejected by a user authorized only in another organization, already-decided deletion requests cannot be approved or rejected again, `agentAuditEvents` record successful agent product actions with `actor.kind = "agent"` plus `delegatedByAuthUserId` and no unused outcome/result field, product and agent audit action/resource labels are schema-bounded and audit rows require resource ids, UI-facing Agent message reads and Agent stream sync require a current Better Auth `project:read` permission plus the matching delegated run and derive the organization and component thread id from `agentRuns`, active expired runs cannot be read, completed runs remain readable history after expiry but cannot call tools again, failed action attempts cannot overwrite completed or revoked terminal states, Convex Agent usage hooks create internal usage events keyed by derived organization, run, delegating user, canonical run thread, normalized non-empty model/provider labels, and validated token counts, usage rows store `organizationId`, `agentRunId`, `threadId`, and `startedByAuthUserId` from `agentRuns` instead of accepting callback identity metadata or duplicating run display names, and reject missing, mismatched, invalid, or incoherent thread/token data including cached-input counts greater than prompt tokens, per-run token budgets fail over-budget runs before appending the over-budget usage event, exhausted organization/user aggregate token budgets fail before creating a new Agent thread or tool side effect, and retention cleanup derives the stored organization plus thread id from a terminal run before deleting Agent thread history plus app usage events while preserving product draft and audit rows.
- `agentic-saas` carries a minimal Better Auth core + Organization local component schema for the proof. It intentionally excludes unused API key, SCIM, Stripe, passkey, OAuth, device, and team tables.
- `agentic-saas` is source-guarded as the in-product agent recipe: the tests
  reject MCP transport dependencies, OAuth Provider dependencies, `server/mcp`
  routes, and public OAuth/MCP runtime primitives in its runtime sources. MCP
  remains a separate `mcp-agent`/`platform-auth` recipe concern.
- `agentic-saas` is also source-guarded as mock-only until provider execution is
  proven: direct real-provider SDK dependencies, real-provider imports, and
  provider API-key env access are rejected across the runtime source set.
- `agentic-saas` audit actors are source-guarded to the actor kinds proven in
  this recipe: human product audit uses `user`, agent audit uses `agent`. Future
  `apiKey`, `service`, or `system` actor kinds remain target extensions until a
  tested recipe uses them.
- `agentic-saas` intentionally removed a `paused` run status from the proof
  schema. There is no pause/resume behavior or requirement yet, and keeping a
  lifecycle state without transitions only makes tool/read authorization harder
  to reason about.
- `agentic-saas` intentionally removed placeholder agent-run `mode`,
  `actingAsAuthUserId`, and `project:create` agent capability fields from the
  proof. The current accepted shape is a delegated run started by one Better
  Auth user; agents may read, draft, or request deletion, while canonical
  product creation remains a human approval action.
- `agentic-saas` now routes canonical product create/delete through `productRecords.ts` helper functions used by Better Auth-checked human approval mutations. This is the local proof that agent-facing operations stay adapters around normal product-domain logic rather than a second product API.
- `agentic-saas` public approval/rejection mutations no longer accept caller-supplied human user ids. They derive the actor from the Better Auth session and call `auth.api.hasPermission()` before mutating product state.
- `agentic-saas` no longer exposes public session-token arguments for Better
  Auth permission checks. Public Convex functions derive auth headers from
  `authComponent.getHeaders(ctx)` only. The `convex-test` harness now maps a
  test-only Better Auth session token to `ctx.auth.getUserIdentity().sessionId`
  before invoking the function, which keeps permission tests representative
  without teaching callers to pass session tokens in Convex args.
- `agentic-saas` no longer exposes a public `startDelegatedRun` mutation that
  accepts `startedByAuthUserId`. The public run-start path is
  `startDelegatedRunWithBetterAuth`, which derives the delegating user from the
  Better Auth session after `auth.api.hasPermission()` succeeds. Tests that need
  generic run setup use `startDelegatedRunAfterPermissionCheck` directly inside
  `convex-test`, preserving the check-before-insert invariant without shipping a
  public bypass.
- Public run start also runtime-rejects old-shape `startedByAuthUserId` before
  creating an `agentRuns` row, so the delegating user has one source of truth:
  the Better Auth session used for the permission check. `starters/agentic-saas`
  still passes `pnpm test` (1 file, 56 tests) and `pnpm typecheck`.
- `agentic-saas` no longer exposes authority fields to the model-visible draft
  tool schema. `createDraft` accepts only product content (`title`, `body`);
  `organizationId` and `agentRunId` are closed over from the checked Agent
  action context. The Convex Agent test intentionally includes hostile
  model-controlled `organizationId` and `agentRunId` fields and still proves the
  resulting draft is attached to the verified run and organization.
- `agentic-saas` pending approval queue reads are not public by organization id.
  `projectDrafts.listPending` and `projectDeletionRequests.listPending` now
  require Better Auth `project:read`, so the Nuxt queue can read canonical
  draft/request tables without adding a projection or frontend-only auth rule.
- `agentic-saas` approval/rejection mutations no longer accept caller-supplied
  organization ids. They read the draft/deletion request row first, derive the
  organization from that canonical row, then check Better Auth permissions for
  that organization before deciding the row.
- `agentic-saas` public operations on existing agent runs no longer accept
  caller-supplied organization ids. Agent execution, revocation, message reads,
  stream reads, and retention cleanup take `agentRunId`, derive organization
  from `agentRuns`, and reject old-shape calls with an `organizationId` field at
  argument validation.
- `agentic-saas` agent-created review helpers no longer accept helper-supplied
  organization ids. Draft creation derives organization from `agentRuns`;
  deletion request creation derives organization from the target product record
  before re-checking the delegating user's current Better Auth permission.
- `agentic-saas` does not keep a public or internal bridge export just to check
  agent capability. Tests prove cross-organization denial through the real
  agent-facing product helper, which keeps domain invariants in the product
  path rather than in a test-only guard surface.
- `agentic-saas` audit labels are not free-form strings. Product and agent
  audit tables use schema-bounded action/resource labels so adding a new audit
  event kind is an intentional schema change, and retained audit rows require a
  resource id. Agent-created deletion-request audit points at the review row it
  created; the target product record remains on the deletion request and later
  product audit. Human rejection audit points at the decided review row and
  stores the matching source id.
- `agentic-saas` destructive agent tools do not store session tokens for
  background authorization. They read Better Auth's own `member` component rows
  and apply the same configured static roles exported from the Better Auth
  setup.
- `agentic-saas` now has `@convex-dev/agent` installed, a Convex Agent component config, and component-backed thread creation inside checked Agent run actions in `convex-test` by registering the official `@convex-dev/agent/test` helper. Raw Agent thread creation is not a public app API; the public surface starts a checked `agentRuns` delegation and Agent actions derive the component thread user from `agentRuns.startedByAuthUserId`.
- `agentic-saas` now proves real Convex Agent tool execution with a mock LLM:
  the model emits a tool call, the Agent executes a Convex tool with injected
  action context, the tool calls the internal `projectDrafts.createFromAgent`
  draft helper, draft/audit rows are written, and Agent component messages are
  persisted. The draft and deletion-request helpers are source-tested as
  `internalMutation`s, not public mutations.
- `agentic-saas` now attaches the real Convex Agent component `threadId` back
  onto `agentRuns` after thread creation. The retention proof exposed why this
  matters: using a placeholder thread id at run start creates a second source
  of truth and breaks cleanup/usage joins.
- `agentic-saas` no longer accepts a caller-provided `threadId` when starting
  a delegated run. Runs start without a thread id, the Agent action attaches the
  normalized real component thread id once, and tests reject later overwrite
  attempts.
- `agentic-saas` now proves UI-facing Agent message reads are authorized
  through the app-owned run, not by accepting the raw Agent component thread id.
  `agentThreads.listAccessibleMessages` first checks Better Auth `project:read`,
  then requires an active or completed `agentRuns` row whose organization and
  delegating user match the request, and finally reads the stored thread id from
  that run. Active expired runs, same-org viewers who did not start the run,
  wrong-organization reads, revoked runs, and runs without an attached thread
  are rejected. Completed runs remain readable even after `expiresAt` because
  expiry bounds delegation, not history.
- `agentic-saas` now proves Convex Agent `streamText` delta persistence with a
  mock LLM. The streaming action requires a delegated run that can be claimed
  as `running` with `project:read`, saves stream deltas through the Agent
  component, marks the run completed, and `agentThreads.syncAccessibleStreams`
  exposes stream list/delta sync only after the same Better Auth and app-run
  checks used for message reads, deriving the component thread id from
  `agentRuns`. A read-only streaming run creates conversation/usage history but
  no product records, draft rows, or agent product-audit rows. Completed stream
  history remains readable after `expiresAt`, matching message reads: expiry
  bounds live delegation, not completed history. A same-org viewer with
  `project:read` still cannot execute another user's read-only stream run; that
  denied attempt leaves the run active without an Agent thread or usage.
- `agentic-saas` Agent actions no longer accept a caller-supplied Agent thread
  `userId`. `generateDraftWithTool` and `streamProjectSummary` assert the
  delegated run first and create Agent threads using
  `agentRuns.startedByAuthUserId`, which also drives usage attribution. This
  removes a second source of truth where a caller could previously make Agent
  component history and usage appear under a different user from the delegation
  record.
- `agentic-saas` public Agent execution now requires the current Better Auth
  session to belong to `agentRuns.startedByAuthUserId` before creating a
  component thread or running tools. A same-organization member with the right
  project permission cannot execute another user's run, and that denied attempt
  leaves the run active with no Agent thread, draft, audit row, or usage event.
  The execution claim also re-checks the delegating user's current Better Auth
  project permission for the requested capability, so a run created before a
  role downgrade or membership removal cannot create an Agent thread, draft,
  audit row, or usage event after the permission change.
- `agentic-saas` now uses `agentRuns.status` as the execution claim instead of
  adding a lock table or second state source. Runs start as `active`, a checked
  Agent action claims one run exactly once as `running` before Agent component
  thread creation, and duplicate claims fail before drafts, usage, or thread
  side effects. `attachThread`, usage recording, and `completeRun` require the
  `running` state, and `attachThread` also rejects expired running delegations so
  an expired run cannot gain the canonical component thread id after claim.
  Expired active delegations fail at claim time and remain active history rows
  with no Agent thread, draft, audit, or usage side effects; no extra expired
  status is needed.
- `agentic-saas` no longer treats `internalMutation` as sufficient protection
  for agent-created review rows. `projectDrafts.createFromAgent` and
  `projectDeletionRequests.createFromAgent` require the run to be `running` and
  to have a stored Agent component thread id before writing review or agent
  audit rows. Tests prove active and threadless runs leave both tables empty.
- `agentic-saas` keeps terminal run states terminal. Agent run lifecycle status
  writes are source-guarded to `agentRuns.ts`. `failRun` accepts active or
  running runs, while `completeRun` requires a running run plus the stored Agent
  thread id so completed runs represent readable history. Tests prove a failed
  later action attempt does not convert `completed` or `revoked` runs to
  `failed`; direct lifecycle-helper tests also prove failed, completed, and
  revoked terminal states cannot be reclassified. Public revocation is
  operationally terminal: a run revoked by the delegating Better Auth user
  cannot later claim execution and leaves no Agent thread, draft, audit row, or
  usage event.
- `agentic-saas` now treats failed Agent executions as terminal and
  non-approvable. When `failRun` moves a run to `failed`, it also marks that
  run's pending draft and deletion-request rows `rejected` with `decidedAt`;
  already-decided rows are not re-decided by run failure. The real over-budget
  Agent path leaves usage/history for diagnosis, but its draft disappears from
  approval queues and cannot be approved, and a failed destructive request
  cannot be listed for approval or delete the canonical product record. If
  retention is requested later, the same failed terminal run can delete its
  stored Agent thread history and usage events without deleting the rejected
  review row.
- `agentic-saas` now proves successful Agent runs do not keep ambient authority
  open. `generateDraftWithTool` marks the run `completed` after the real Agent
  tool path persists messages and usage. Completed runs remain readable as
  conversation history, but the internal `projectDrafts.createFromAgent` helper
  rejects a follow-up tool call with `Agent run is not running`.
- `agentic-saas` now proves the secret redaction boundary for Agent thread
  history. Convex Agent can persist both tool-call args and tool results, so raw
  secrets must not be passed through model-visible tool args. The public Agent
  action no longer accepts a source token argument; the draft tool returns only
  a `[redacted]` marker for integration-secret-shaped output, and tests verify
  persisted Agent messages contain the redacted marker while excluding the raw
  server-only secret canary.
- `agentic-saas` now wires Convex Agent `usageHandler` into an internal
  `agentUsage.recordUsage` mutation. The proof intentionally stores append-only
  usage events, not rollup counters, to avoid derived billing state before a
  reporting requirement exists. The usage callback thread id must match the
  run, but stored usage thread identity is derived from `agentRuns`. Model and
  provider labels are trimmed and must be non-empty before a usage row is
  appended. Expired running runs cannot append usage, so delegation expiry also
  bounds billing/retention state.
- `agentic-saas` usage budget preflight, usage recording, and usage retention
  cleanup no longer accept caller-supplied organization ids. They derive the
  organization from `agentRuns`, and old-shape usage calls with
  `organizationId` fail Convex argument validation.
- `agentic-saas` app usage-event retention cleanup no longer accepts a
  caller-supplied thread id. It takes `agentRunId`, derives the component
  thread id from `agentRuns`, queries usage rows by `agentRunId`, and rejects
  old-shape cleanup calls with `threadId`. The cleanup helper also rejects
  active and running runs before checking thread state.
- `agentic-saas` now proves run-level token budget enforcement through the real
  Agent path. The enforcement sums append-only usage events by `agentRunId`,
  rejects the over-budget write, and marks the run failed from the action catch
  path. A failed attempt to patch the run inside the throwing usage mutation
  showed the important Convex invariant: writes in a throwing mutation roll
  back, so durable failure state must be written in a separate transaction.
- `agentic-saas` now proves organization/user aggregate token budgets without
  adding rollup counters. The action runs an internal preflight query before
  creating an Agent thread, and `agentUsage.recordUsage` enforces the same
  limits from append-only usage events before inserting each usage row. This
  two-step shape matters because the Convex Agent `usageHandler` runs after a
  model step; post-call accounting alone can reject persistence, but it cannot
  prevent the model/tool step that already happened. Tests now assert exhausted
  follow-up runs are marked failed but remain threadless and create no draft,
  agent audit, or usage rows of their own.
- `agentic-saas` now proves the retention policy for conversation history:
  `Agent.deleteThreadSync()` deletes Convex Agent thread/messages/streams, and
  an app-owned internal mutation deletes `agentUsageEvents` for that thread.
  Completed and failed terminal runs with stored Agent threads are eligible.
  Product drafts and product/agent audit rows are intentionally retained as
  canonical product history, including rejected rows from failed runs. The same
  retention action is retryable without a second cleanup-state table: a repeat
  call sees no messages and deletes zero usage rows while leaving product/audit
  history intact. Same-organization readers cannot retention-delete another
  user's run; the delegating user remains the owner of conversation deletion.
  This cleanup crosses Agent component state and app state, so a production
  compliance workflow should still handle partial failure and retry the same
  command.
- `team` live-proves the real Better Auth Organization permission boundary for
  product functions: product mutations call `auth.api.hasPermission()`, owner
  and member writes succeed, viewer write fails with `Missing project:create
permission`, and outsider access fails with `User is not a member of the
organization`.
- `mcp-agent` proves service actor credential hashing, credential revocation denial, organization scoping, active owner/admin-only service actor credential issuance and revocation keyed by the stored organization, service actor roles split from human roles so agents cannot be `owner`, SHA-256 credential digest validation, duplicate credential-hash rejection before service actor insert, read-only actor write denial, role downgrade enforcement, destructive approval creation derived from the target project and active owner/admin membership with the approving human recorded, approval-gated destructive writes with schema-bounded approval operation labels, schema-bounded service audit action/resource labels, deletion/source-guarding of the fake caller-supplied agent usage action, secret/hash redaction in tool output, Nuxt MCP Toolkit Streamable HTTP exposure through a real MCP SDK client, authenticated `tools/list` metadata, unauthenticated and malformed-auth tool listing hidden through request-time `enabled(event)` guards, strict `Bearer <secret>` parsing that rejects extra bearer parts, malformed-auth/unauthenticated/undeclared `tools/call` rejection before Convex HTTP, read and write `tools/call` success through the toolkit handler into a Convex-shaped HTTP backend, Convex-side project-name normalization and max-length rejection before MCP product writes, Streamable HTTP tool responses that do not expose the bearer secret, its SHA-256 hash, or the credential hash field name, direct MCP tool adapters using MCP request metadata against real `convex-test` product functions, undeclared/hidden tool-call rejection as an MCP `isError` result, soft MCP middleware auth that avoids OAuth discovery, default Origin rejection for cross-origin Streamable HTTP requests, and a source guard that keeps OAuth Provider dependencies and public OAuth MCP primitives out of the private service-actor starter.
- `vertical-ai` proves AI output stays draft-only, human approval promotes draft state to canonical state, rejected drafts cannot be promoted, and approval audit records actor plus source draft.

What those tests do not prove:

- `agentic-saas` proves live Better Auth run-start authorization, Better Auth-checked backend approval, Better Auth-gated approval queue reads, Convex Agent runtime thread creation, Agent message persistence, real Agent tool execution with a mock LLM, Agent `streamText` delta persistence with a mock LLM, Agent usage attribution, run-level token budgets, organization/user aggregate token budgets, anonymous local Convex component installation/codegen/backend typecheck, and an authenticated local browser runtime for the Nuxt approval queue against anonymous local Convex. It still does not prove real provider LLM generation, provider-backed streaming, authenticated browser runtime against a real project deployment, MCP transport, billing invoices, or public OAuth.
- `agentic-saas` does not prove Convex Rate Limiter component behavior. Its
  usage checks are absolute token budgets over append-only usage rows, not
  time-window message or token throughput limits.
- `mcp-agent` and `vertical-ai` do not prove the final Better Auth Organization SaaS Kit shape because both still own app `organizations` and `memberships`.
- `vertical-ai` imports `@convex-dev/agent`, but the tests do not exercise a live LLM generation path. They prove the draft/approval invariant around agent-created drafts.
- `mcp-agent` does not yet prove `tools/call` against a deployed Convex backend.
  It now proves successful read/write `tools/call` through the Nuxt MCP Toolkit
  route into a Convex-shaped HTTP backend, proves the actual MCP tool adapters
  against real `convex-test` product functions, and separately proves the core
  Convex product invariants with `convex-test`.
- The current `@better-auth/oauth-provider` package has a mounted
  authorization-code lifecycle proof in `platform-auth`, but public OAuth/MCP is
  still not safe to recommend. Refresh-token rotation fails on the
  null-vs-absent `revoked` contract until the row is proof-mutated to explicit
  `null`; that explicit-null mutation makes rotation work and confirms the
  exact contract issue. OAuth Provider's `mcpHandler` token gate is proven for
  a `tools/call`-shaped request, and the Convex `/mcp` proof route writes
  product state through an internal mutation that re-checks Better Auth OAuth
  client state before writing; authenticated unknown tools do not write. Nuxt
  MCP Toolkit execution into Convex product functions with these OAuth tokens
  remains unproven. Client-credentials
  issuance, protected-resource metadata generation, resource-bound JWTs,
  invalid resource rejection, and resource-client remote introspection plus
  local JWKS verification are now proven.
- The Better Auth Organization team starter is not the right place for agent surfaces. Its local `AGENTS.md` explicitly says to keep MCP and agents out and use the `mcp-agent` starter. A short-lived attempt to add `agentRuns` there was removed; the valid path is a separate `agentic-saas` track or a refactor of `mcp-agent` onto Better Auth Organization.

## Current Completion Audit

| Requirement                                                                     | Status                                   | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep core `better-convex-nuxt` as integration runtime, not SaaS product runtime | Proven as architecture direction         | Accepted SaaS Kit direction plus this document's split between core runtime and optional recipe tracks.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Better Auth owns users, organizations, members, roles, sessions                 | Proven locally for final direction       | `team` product authorization proof uses Better Auth Organization; `agentic-saas` schema intentionally has no app-owned organization/member tables and has a test for that.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Agent identity is app-owned delegation, not Better Auth membership              | Proven locally                           | `agentRuns` table, `startDelegatedRunWithBetterAuth`, and tests for bounded runs, permission-before-insert, wrong user rejection, one-shot active-to-running execution claim, revocation, expiry, and terminal states.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Agent tools have no ambient authority                                           | Proven locally                           | `requireAgentCapability`, destructive re-checks of current Better Auth membership/role, and tests for wrong org, missing capability, revoked/expired/completed runs, downgrade, and removal.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Agent output cannot directly become canonical product state by default          | Proven locally                           | Draft-first `projectDrafts`, Better Auth-checked approval mutations, destructive `projectDeletionRequests`, and tests for unauthorized, rejected, already-approved, failed-run auto-rejected, and approval-gated flows.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Destructive approval queues avoid duplicate pending state                       | Proven locally                           | `projectDeletionRequests.createFromAgent` rejects a second pending deletion request for the same `productRecords` row, so one approval cannot leave another pending request pointing at already-deleted canonical state.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Agent thread/message infrastructure is not authorization state                  | Proven locally                           | Convex Agent thread id normalizes and attaches once to `agentRuns`; message/stream reads and retention cleanup derive the thread id from the stored run instead of accepting caller-supplied thread ids.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Tool-call secrets are not persisted into model-visible history                  | Proven locally                           | Public Agent actions no longer accept source-token args; the redaction test verifies persisted Agent messages contain the redacted marker for integration-secret-shaped tool output.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Usage is attributed without derived billing state                               | Proven locally                           | Convex Agent `usageHandler` writes append-only `agentUsageEvents` only for running, unexpired runs whose thread id must match the canonical `agentRuns.threadId`; token budget tests sum raw events instead of rollup counters.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Unified product actor union across user, agent, API key, service, and system    | Partially proven                         | `agentic-saas` proves user and agent audit actors. `mcp-agent` proves service actor authorization separately. API key and system actor shapes remain target extensions and should not be added to `agentic-saas` until used by a tested recipe.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Conversation retention preserves product/audit history                          | Proven locally                           | Retention tests delete Agent thread/messages/streams and app usage events for the stored terminal run thread while preserving product draft and audit rows; cleanup is retryable without a second cleanup-state table; public retention and internal app usage cleanup both reject active and running runs before cleanup, even before a thread is attached.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Nuxt approval queue works with a real browser session                           | Proven against anonymous local Convex    | Browser proof signs up through Nuxt auth proxy, creates org, starts an agent draft, lists and approves it, then verifies canonical rows.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Public Convex APIs have final auth argument shape                               | Proven locally                           | `sessionTokenForProof` and the `ALLOW_AGENTIC_SAAS_PROOF_TOKENS` gate were deleted from public functions. Permission tests pass by setting a `convex-test` identity with the Better Auth session id, the same source `authComponent.getHeaders(ctx)` uses at runtime.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Agentic SaaS public functions have product names                                | Proven locally                           | The proof-era action/query names were hard-cut to product names such as `generateDraftWithTool`, `streamProjectSummary`, `deleteThreadForRetention`, `listAccessibleMessages`, and `syncAccessibleStreams`; public raw-token and thread-id retention arguments were deleted. `rg` finds none of the old names in non-generated `agentic-saas` files.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Private MCP transport can call product functions without becoming authz         | Proven locally, deployed runtime missing | Nuxt MCP Toolkit tests prove Streamable HTTP route into a Convex-shaped backend; direct adapter tests prove MCP metadata into real `convex-test` product functions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Public OAuth/MCP can be safely recommended                                      | Partially proven, not recommended yet    | Deprecated Better Auth `mcp()` lifecycle still passes locally with documented limits, but it is not the recommended path. Current OAuth Provider is mounted in `platform-auth` and proves metadata, authenticated DCR, consent, authorization-code exchange, userinfo, introspection, revocation, revoked-token rejection, client-credentials issuance, resource-bound JWTs, invalid resource rejection, mounted protected-resource metadata, resource-client remote introspection plus local JWKS verification, `mcpHandler` token gating for a `tools/call`-shaped protected handler, Convex `/mcp` product writes through an internal mutation that re-checks Better Auth OAuth client state while authenticated unknown tools do not write, and a source guard that prevents mixing the current OAuth Provider schema with deprecated `mcp()`/`oidcProvider()` plugin tables. It still cannot be recommended for public MCP because default refresh-token rotation fails on the Convex null-vs-absent `revoked` contract. A proof-only explicit-null mutation makes rotation work, so the root cause is known, but Nuxt MCP Toolkit execution and deployed runtime behavior with these OAuth tokens are still not proven. |
| Real provider LLM generation and streaming                                      | Not proven                               | Mock LLM tool execution and streaming are proven, and `agentic-saas` is source-tested to avoid provider SDK dependencies or provider API-key env access while that proof is missing. The 2026-06-23 prerequisite check found no `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, or `AI_GATEWAY_API_KEY`, so a real provider runtime proof cannot be honestly run from the current workspace state.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Cloud/project deployment behavior                                               | Not proven                               | Anonymous local Convex component install/codegen/backend typecheck and browser proof are proven; generated `.env.local` files are cleanup artifacts, not checked-in proof state. The 2026-06-23 prerequisite check found no `CONVEX_DEPLOY_KEY`, `CONVEX_DEPLOYMENT`, `CONVEX_URL`, or `NUXT_PUBLIC_CONVEX_URL`, so configured project deployment is still missing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Billing and invoices                                                            | Deliberately deferred                    | Raw usage events are proven; no reporting requirement justifies invoice tables, rollups, or background jobs yet.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Time-window rate limiting                                                       | Deliberately deferred                    | Absolute token budgets are proven; Convex Rate Limiter integration should wait for concrete throughput limits.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Final docs/templates                                                            | Partially complete                       | The concise architecture direction is now in `docs/content/docs/8.architecture/2.ai-agents-and-mcp.md`; starter-specific shipping docs still depend on provider/deployment proof results.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

Proof environment notes:

- The starter test scripts needed `nuxi prepare` because tests import Nuxt server files that extend `./.nuxt/tsconfig.json`.
- Both starters now link the local root package with `"better-convex-nuxt": "link:../.."`; fetching `better-convex-nuxt@^0.4.0` from npm failed because the latest published version is `0.3.4`.
- `starters/vertical-ai` had an invalid dependency named `".."` and an invalid `pnpm-workspace.yaml` override key; those prevented install and were removed.
- `pnpm typecheck` exits zero but emits warnings: `auth: true` has no local `siteUrl`, and Vue language tooling logs `vue-router/volar/sfc-route-blocks` as a missing package export. Treat this as a tooling cleanup item before calling the starters polished.
- `agentic-saas` Nuxt dev render works. The browser proof surfaced one real
  dev-server polish item: `better-auth/client/plugins` should be pre-bundled
  because the approval page imports the Better Auth Organization client plugin.
  The starter now includes that Vite optimize-deps entry.
- `CONVEX_AGENT_MODE=anonymous` is the repeatable local Convex setup path for
  `starters/agentic-saas`. A plain `convex deployment create local --select`
  still fails in anonymous/project-unconfigured mode, but `convex dev --once`
  in anonymous mode creates an ignored `.env.local`, installs both components,
  runs Convex backend typecheck, and makes later `pnpm convex:codegen` pass.
- Provider-backed LLM proof is externally gated in this workspace. On
  2026-06-23, the environment had no `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`,
  `GOOGLE_GENERATIVE_AI_API_KEY`, or `AI_GATEWAY_API_KEY`. Do not add another
  mock path and call it provider coverage.
- Deployed Convex proof is externally gated in this workspace. The active
  proof starters are selected to anonymous local deployments, so commands such
  as `convex env list` and `convex function-spec --prod` do not prove cloud
  behavior here.
- The architecture docs page was added and `docs` dependencies install with
  the bundled Node 24 runtime plus pinned pnpm 10. `pnpm typecheck` and
  `pnpm build` in `docs` both exit zero with that runtime. The docs typecheck
  proof required deleting stale assumptions rather than adding wrappers:
  `UContentSearchButton` now receives `undefined` instead of `null`,
  Plausible init receives an explicit options object, both content collections
  share the same sitemap frontmatter schema including `sitemap: false`, and the
  sitemap source route returns plain sitemap URL objects from the current Nuxt
  Content `path` field instead of relying on missing sitemap auto-imports and
  stale `_path`/timestamp fields. Full `pnpm lint` in `docs` now exits zero
  after formatting the docs app and removing an unused local `props` binding
  from `UInputCopy.vue`.
- Browser auth needed two pieces that the first proof starter did not have:
  `convex/http.ts` must register Better Auth routes with
  `authComponent.registerRoutesLazy(http, createAuth)`, and the local Convex
  deployment must store `SITE_URL` plus `BETTER_AUTH_SECRET` through
  `convex env set`. Passing those only as shell env to `convex dev` was not
  enough for HTTP action runtime; the first browser sign-up failed with
  `Invalid origin` until `SITE_URL` was set on the local deployment.
- The stricter Convex backend typecheck caught issues that Nuxt typecheck did
  not: broad `any` IDs made `ctx.db.get()` lose table-specific narrowing,
  action/tool inference needed explicit return types in one recursive path, and
  the starter had dead Better Auth trigger wiring to `internal.auth` without
  actual triggers. Those were fixed by using generated `Id<...>` types,
  annotating the retention action result, and deleting unused auth hook wiring.
- The root ESLint ignore for Convex generated files must match nested component
  output, not only the top-level `convex/_generated` directory. The proven
  pattern is `**/convex/**/_generated/**`, because local Better Auth component
  output appears under `convex/betterAuth/_generated`.
- The public runtime composables should keep auth readiness delegated to the
  existing `ConvexAuthEngine`. The consumer smoke fixture proves that actions
  and mutations need the same explicit injected-engine type used elsewhere; do
  not add a second auth resolver or duplicate readiness state.
- The current local Convex deployment has been reused across proof starters.
  During `starters/team` live Better Auth verification, the import summary still
  listed prior `agentRuns`/`agentAuditEvents` app tables even though the team
  starter should not contain agent surfaces. Future runtime proof should use
  separate local deployments per starter or hard-reset app and component tables
  before treating table inspection as evidence. A later team proof also logged
  stale subscriptions for `projectDrafts:listPending` and
  `projectDeletionRequests:listPending`, functions that belong to
  `agentic-saas`, while the team backend was running. The same issue can break
  schema validation inside one starter: `agentic-saas` failed
  `pnpm convex:local:once` against stale generated `.convex` SQLite rows that
  still had the removed `agentAuditEvents.outcome` field, then passed after
  deleting generated `.convex`/`.env.local` and rerunning fresh. Close old
  browser clients and isolate or reset local deployment state before using local
  backend logs, table inspection, or schema validation as proof evidence.

## Recommended Template

`agentic-saas` should include:

- Better Auth local Convex component;
- Better Auth Organization with static roles;
- Convex Agent component;
- app-owned `agentRuns`;
- app-owned product audit that represents `user` and `agent` actors first, with
  `apiKey`, `service`, and `system` added only when those recipes are present
  and tested;
- tool guards in `convex/lib/agentAuthz.ts`;
- tools in `convex/agentTools.ts` that call normal product functions;
- draft-first product examples;
- approval UI for destructive/sensitive tools;
- usage tracking by organization, user, and run;
- optional time-window rate limiting with the Convex Rate Limiter component
  after the product decides concrete limits;
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

## Final Template Cutover Checklist

Before turning `starters/agentic-saas` into a shipped SaaS Kit template, make a
hard cutover rather than leaving proof and production paths side by side:

1. Keep the public auth argument hard cutover: Convex functions should not
   accept session tokens, user ids, or role hints as args. Better Auth headers
   must continue to come from `authComponent.getHeaders(ctx)` only.
2. Replace `mockModel` with a real provider only in the provider-enabled
   starter. Keep the mock path in tests, not in user-facing runtime examples.
3. Keep the app-owned schema narrow: `agentRuns`, product drafts/requests,
   product/audit rows, and raw usage events. Do not add organization/member
   mirrors, unused actor variants, billing rollups, projections, caches, or
   generic permission DSLs during cutover.
4. Keep canonical product mutations behind Better Auth-checked human actions.
   Agent tools should keep creating draft/proposal/request state unless a
   specific product requirement justifies a direct write.
5. Use the real Agent component thread id as the only conversation join key.
   Do not reintroduce caller-provided thread ids or placeholder thread ids.
6. Split `mcp-saas` from `agentic-saas`. MCP service actors, bearer
   credentials, OAuth Provider, and MCP Apps are separate platform/API surfaces,
   not required for the in-product agent starter.
7. Re-run the proof suite after the cutover: `pnpm test`, `pnpm typecheck`,
   `pnpm build`, `pnpm convex:local:once`, `pnpm convex:codegen`, and a browser
   approval queue proof.
8. Only claim cloud support after running the same browser flow against a real
   configured Convex project deployment.

## What Is Missing

### Must Prove Before Claiming Agentic SaaS

- Prove the same starter against a real configured Convex project deployment if
  the final template wants to claim deployed-project coverage. Anonymous local
  component install/codegen/backend typecheck is proven.
- Prove real provider LLM generation and provider-backed streaming if the
  starter wants to claim provider coverage. Mock LLM tool execution and mock
  LLM stream delta persistence are proven.
- Run the Nuxt approval queue against a real configured Convex project
  deployment if the final template wants cloud/project deployment coverage.
  Anonymous local Convex plus real Better Auth browser session is proven.
- Add billing/cost rollups only after reporting requirements are concrete.
- Prove time-window rate limiting only after deciding it is a product
  requirement. The likely source-of-truth path is the Convex Rate Limiter
  component for message frequency and token throughput, not custom counters in
  `agentRuns`.
- Decide whether product audit has a separate legal retention window. Agent
  thread/message deletion and app usage event deletion are proven.

### Must Prove Before Claiming MCP Platform Auth

- Treat Nuxt MCP Toolkit as the default host for the private MCP recipe, not as
  core SaaS Kit runtime.
- Prove the same read/write `tools/call` path against a real deployed Convex
  backend once a real `NUXT_PUBLIC_CONVEX_URL` is configured.
- Keep private recipe `tools/list` broad until a product UX requirement proves
  role-filtering is necessary. Role-filtering would require Convex auth queries
  during listing and risks becoming a second authorization source. Convex
  execution-time checks remain the source of truth.
- If role-filtered tool listing becomes a product requirement, prove
  unauthorized tools are omitted and direct `tools/call` still fails backend
  authorization. Do not add this by default.
- Prove tool execution still fails if a caller sends an unauthorized operation
  through a deployed Convex-backed MCP endpoint. The fake-Convex HTTP proof
  covers transport success, the direct adapter proof covers MCP metadata into
  real Convex functions, the platform-auth proof covers OAuth Provider
  `mcpHandler` token/scope gating plus Convex `/mcp` product writes with
  disabled-client denial, and deployed Convex runtime remains unproven.
- Keep `@better-auth/oauth-provider@1.6.20` in the separate `platform-auth`
  spike. Do not mount it side-by-side with the existing `team` OIDC/MCP
  experiments, because the current OAuth Provider schema has a different
  `oauthAccessToken` shape and uses `oauthClient`/`oauthRefreshToken` instead
  of the old `oauthApplication` model.
- Resolve the refresh-token rotation failure before claiming public OAuth
  support. The pinned provider filters `revoked eq null`; Convex-created
  refresh-token rows omit optional `revoked`, so rotation fails with
  `invalid_grant` despite a valid unexpired row. The proof-only explicit-null
  mutation makes rotation succeed, so fix this upstream or in the adapter
  contract rather than adding an app-level shim.
- Keep the advertised JWKS route narrow. `/api/auth/jwks` delegates to the
  existing Better Auth Convex `/api/auth/convex/jwks` endpoint so OAuth
  metadata has a working JWKS URI without adding a second key source.
- Decide whether `client_credentials` is a real product requirement.
  Authenticated client-credentials registration and token issuance are proven
  for `project:create`, and that token can gate a protected MCP handler before
  tool execution.
- Keep resource-bound token proof on the current package runtime. Valid
  audience-bound JWT access tokens and invalid resource rejection are proven.
  PKCE for authorization-code plus offline-access clients is proven.
- Keep revocation and introspection proof on the current package runtime.
  Access-token introspection, revocation, and revoked-token rejection are proven;
  default refresh-token rotation remains blocked by the refresh contract until
  `revoked` is explicit `null`.
- Decide token invalidation semantics for product routes.
- Decide whether client credentials are a real product requirement; if not,
  keep service integrations on Better Auth API keys or private service actors.

### Must Fix Or Retire

- Refactor `starters/mcp-agent` away from app-owned organizations/memberships if it becomes part of the SaaS Kit.
- Avoid teaching the deprecated Better Auth `mcp()` plugin as the preferred path.
- Do not present Better Auth Agent Auth as product direction until compatibility and source-of-truth ownership are proven.
- Keep the final SaaS Kit docs aligned with the proof ledger before shipping the
  templates.
- Decide the formatter owner before enforcing root `format:check`. Today
  `oxfmt --check` fails broadly, while applying it to docs creates output that
  docs ESLint immediately rewrites. Do not paper over this in the SaaS Kit proof;
  fix the formatter policy once at the repo level.

## Acceptance Tests

Minimum `agentic-saas` tests:

- outsider cannot start an agent run for another organization;
- user without product permission cannot start a write-capable run;
- non-delegating user cannot execute another user's active agent run and leaves
  no Agent thread, draft, audit, or usage side effects;
- an active run must be claimed exactly once as running before Agent thread,
  usage, or tool side effects;
- execution claim re-checks current Better Auth project permission and leaves
  downgraded or removed-member runs active without Agent thread, draft, audit,
  or usage side effects;
- public revocation prevents later execution and leaves no Agent thread, draft,
  audit, or usage side effects;
- expired active delegations fail before Agent thread, draft, audit, or usage
  side effects without adding a second expired state;
- agent-created draft/request helpers cannot create review or audit rows until
  the run is running and has an attached Agent thread;
- failed runs reject their pending review rows, remove them from approval
  queues, and those rows cannot later be approved into canonical product state;
- non-delegating user cannot revoke another user's active agent run;
- completed runs require a stored Agent thread id;
- completed runs cannot be revoked and remain readable history;
- completed runs remain readable history after expiry;
- agent-only draft/request helper functions are internal, not public mutations,
  and source-tested as such;
- model-visible tool input cannot retarget `organizationId`, `agentRunId`, user
  ids, scopes, or credential ids;
- public retention cleanup does not accept caller-supplied thread ids and cannot
  delete active or running runs;
- public message and stream reads do not accept caller-supplied thread ids;
- public agent execution, revocation, message/stream reads, and retention
  cleanup do not accept caller-supplied organization ids for existing runs;
- agent-created draft/request helpers derive organization from canonical run or
  product rows and reject old-shape helper calls with organization ids;
- usage events cannot be recorded before a run has a canonical Agent thread id
  or with a mismatched thread id;
- usage events cannot be recorded for expired running runs;
- usage events derive organization/agent/user attribution from `agentRuns`,
  reject old-shape calls with caller-supplied organization ids, and reject
  blank model/provider labels, invalid token counters, incoherent totals, and
  cached-input counts greater than prompt tokens;
- agent cannot call a tool outside its delegated capability list;
- agent cannot access another organization's resource;
- blank agent names are rejected and duplicated capabilities are deduplicated
  into stable canonical order before storing `agentRuns`;
- invalid run expiry and token budgets do not create runs;
- revoked run cannot call tools;
- expired run cannot call tools;
- completed run cannot call tools after successful Agent execution;
- blank agent-created draft content and deletion reasons do not create review
  rows or agent audit events;
- destructive tool creates a pending approval and does not mutate before approval;
- duplicate pending destructive requests for one product record are rejected;
- unauthorized user cannot approve;
- user authorized in another organization cannot approve or reject
  cross-organization draft/deletion request ids;
- approval/rejection decisions derive authorization organization from the
  draft/deletion request row instead of caller input;
- old-shape approval/rejection calls with caller-supplied organization ids
  cannot steer decision authorization;
- already-decided draft and deletion request rows cannot be approved or
  rejected again;
- role downgrade or member removal blocks future high-risk agent actions;
- agent audit distinguishes `agent` actor and delegating user without unused
  outcome/result fields;
- audit action/resource labels are schema-bounded, not arbitrary strings,
  retained audit rows require resource ids, and agent-created deletion-request
  audit points at the created review row;
- human rejection audit for drafts and deletion requests points at the decided
  review row and matching source id;
- usage is attributed to org/user/run from canonical run state, stores one user
  attribution field, keeps display names on `agentRuns`, and does not accept
  callback-supplied identity metadata or organization ids;
- run-level token budget blocks over-budget usage;
- organization/user aggregate token budgets block already-exhausted follow-up
  runs before Agent thread/tool side effects and leave no draft, audit, or usage
  rows for the blocked run;
- raw secrets are absent from persisted Agent tool-call/tool-result messages;
- stream sync derives the thread from an accessible active or completed run;
- read-only streaming creates Agent stream and usage history without product
  records, draft rows, or agent product-audit rows;
- non-delegating user cannot execute another user's read-only stream run and
  leaves no Agent thread or usage side effects;
- retention cleanup derives the thread id from the stored terminal run and
  deletes Agent messages and usage events without deleting product/audit
  history; repeating the same cleanup command is a no-op for already-deleted
  messages and usage; same-org readers cannot retention-delete another
  delegator's run; app usage cleanup rejects old-shape calls with caller-supplied
  thread ids and active runs;
- thread query verifies the thread belongs to an accessible active or completed run.

Minimum `mcp-saas` tests:

- missing or malformed bearer/API key hides private tools without triggering
  OAuth discovery;
- revoked credential is rejected;
- wrong organization argument is rejected;
- read-only actor cannot write;
- `tools/list` may stay broad by default, but direct `tools/call` must re-check
  backend permissions;
- read and write `tools/call` succeed through the Nuxt MCP route into a
  Convex-shaped HTTP backend;
- undeclared `tools/call` returns an MCP error result before backend execution;
- raw secrets and credential hashes never appear in tool output;
- Origin validation rejects invalid browser origins;
- public OAuth tokens, if enabled, require correct audience/resource and scope.

## Recommended Next Work

1. Run the Nuxt approval queue against a real configured Convex project
   deployment if cloud/project deployment coverage is required.
2. Add billing/cost rollups only after concrete reporting requirements exist.
3. Run the `mcp-agent` Nuxt MCP Toolkit route against a configured real Convex
   deployment. The route now succeeds against a Convex-shaped HTTP test backend
   and its tool adapters succeed against real `convex-test` functions; the
   remaining proof is deployed Convex runtime, not toolkit dispatch or adapter
   logic.
4. Continue the separate OAuth Provider runtime spike only when public MCP
   becomes a product requirement: fix or upstream the refresh-token rotation
   null-vs-absent issue, then create a separate Nuxt MCP Toolkit OAuth recipe
   if the product needs public MCP hosted from Nuxt. Do not add this path to
   `team` or the private `mcp-agent` recipe.
5. Keep Better Auth Agent Auth as a separate platform-auth spike until the
   private MCP and in-product agent paths are green.

## Sources Checked

Local:

- `/Users/matthias/.codex/attachments/7d437371-4854-4c93-8586-28a82109494c/pasted-text.txt`
- `/Users/matthias/.codex/attachments/bfca6e5e-44ab-4bcd-a61f-12b93b74407a/pasted-text.txt`
- `docs/content/docs/8.architecture/1.saas-kit-direction.md`
- `new-direction.md`
- `learnings.md`
- `starters/research/005-mcp-and-agents.md`
- `starters/mcp-agent`
- `starters/platform-auth`
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
