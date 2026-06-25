# New Direction: Better Convex Nuxt SaaS Kit

## Executive Recommendation

Build `better-convex-nuxt` as the best Nuxt integration for Convex, then ship an opt-in SaaS Kit as verified templates, generated userland code, and thin composables.

Do not turn the core library into a SaaS framework. The strongest product is a stack with clear ownership:

- Better Auth owns auth-domain state: users, sessions, organizations, members, invitations, roles, admin controls, MFA, passwordless methods, and API keys.
- Convex owns product-domain state: projects, business records, tenant data, workflows, product audit logs, and final backend authorization enforcement.
- Nuxt owns UX: forms, navigation, display state, optimistic UI, and route ergonomics.

The sellable promise:

> Build production tenant-aware SaaS with Nuxt, Convex, and Better Auth, using verified auth, tenant, and authorization templates instead of assembling the stack from scratch.

The technical promise:

> One source of truth per concept. Better Auth handles identity and tenant membership. Convex enforces product invariants. The library removes integration friction without inventing a second auth system.

## Product Positioning

### What We Are Selling

Sell this as a full-stack SaaS app foundation, not as a generic auth helper.

Good positioning:

- "The Nuxt + Convex SaaS stack powered by Better Auth."
- "Realtime tenant-aware apps with organizations, roles, API keys, and server-enforced permissions."
- "Start with a verified template, then keep only the pieces your app needs."
- "Auth-domain heavy lifting by Better Auth. Product-domain truth in Convex."

Avoid positioning that implies we own everything:

- Do not say we are replacing Better Auth.
- Do not say we are a universal permission engine.
- Do not imply SSO/SCIM are solved in pure Convex until proven.
- Do not sell dynamic roles, API platform auth, or enterprise identity as defaults.

### Why This Is Valuable

The hard part for SaaS developers is not creating a login form. It is making all of these work together:

- SSR-safe auth state in Nuxt.
- Convex JWT sync.
- Better Auth plugin clients.
- Better Auth local component schema generation.
- Tenant membership and roles.
- Backend product authorization.
- API keys that authorize product routes.
- Admin controls.
- Audit logs.
- No duplicate membership tables.
- Local verification loops that prove the stack actually works.

This library should make those boundaries obvious and boring.

## Non-Negotiable Architecture

### Source Of Truth Map

| Concept | Owner | Stored Where | Notes |
| --- | --- | --- | --- |
| Auth user | Better Auth | Better Auth Convex component | App `users` table may be a trigger-derived projection only. |
| Session | Better Auth | Better Auth Convex component | Convex JWT is derived from Better Auth session. |
| Organization | Better Auth Organization | Better Auth Convex component | No app-owned organization mirror in SaaS templates. |
| Member | Better Auth Organization | Better Auth Convex component | No app-owned membership mirror. |
| Invitation | Better Auth Organization | Better Auth Convex component | Invitation lifecycle belongs to Better Auth. |
| Role | Better Auth Organization | Better Auth component | Static roles by default; dynamic roles only when needed. |
| API key | Better Auth API Key | Better Auth Convex component | Raw secrets never copied into app tables. |
| Agent thread/message history | Convex Agent component | Convex Agent component | Useful infrastructure, not product authorization authority. |
| Agent delegation/run | App | Convex app tables | Binds an agent run to an organization, delegating user, allowed capabilities, and lifecycle. |
| Product tenant data | App | Convex app tables | Store Better Auth organization ids as strings. |
| Product authorization | App Convex functions | Convex code calling Better Auth APIs | Frontend checks are display-only. |
| Product audit log | App | Convex app tables | Immutable product history, including optional membership history events. |

### The Main Cutover Rule

For SaaS templates, do a hard cutover:

1. Use a local Better Auth Convex component.
2. Enable Better Auth `organization()`.
3. Delete app-owned `organizations`, `memberships`, and `invitations`.
4. Store product rows with Better Auth `organizationId` strings.
5. Enforce product permissions inside Convex functions with Better Auth `hasPermission()`.

Do not ship templates that keep app-owned membership tables beside Better Auth Organization. That is a second source of truth.

## Greenfield Cutover Policy

For the current phase, the SaaS Kit templates and optional APIs are greenfield. Prefer hard cutovers over compatibility.

Rules:

- Delete old paths once the new path passes tests.
- Do not keep legacy app-owned tenant tables beside Better Auth Organization.
- Do not add migration helpers until there are real users with production data.
- Do not preserve old template APIs for unreleased starters.
- Do not add compatibility shims for old role, membership, invitation, or project paths.
- Breaking changes are acceptable when they reduce sources of truth or simplify the architecture.
- Update docs and tests immediately after each cutover so only the current path is taught.

This policy changes once the templates are declared stable.

## Lessons From Convex Tenant/Authz Components

Local references researched:

- `/Users/matthias/Git/convex/convex-tenants`
- `/Users/matthias/Git/convex/convex-authz`
- `/Users/matthias/Git/external/convex-auths/convex-authz`

These repos are useful reference architectures. They should influence our packaging and verification strategy, but they should not define the default data model for this stack.

### What Convex Components Are Good At

A Convex component is a packaged backend module with its own schema, functions, generated API, and installation through `convex/convex.config.ts`.

Components are a good fit when the component owns a durable canonical domain. Examples:

- `convex-authz` owns role assignments, permission overrides, effective permissions, relationships, custom roles, and audit rows.
- `convex-tenants` owns organizations, members, teams, invitations, organization settings, and tenant lifecycle operations.
- `@convex-dev/better-auth` owns Better Auth storage and JWT issuance.

The default SaaS Kit already needs the Better Auth Convex component. Adding another component that owns tenants or memberships would create competing canonical state.

### `convex-tenants` Learning

`convex-tenants` is a complete tenant-management component. It owns:

- organizations
- members
- teams
- team members
- invitations
- organization status
- organization metadata/settings

It wires authorization through `convex-authz` and exposes a `makeTenantsAPI()` factory that consumers destructure into public Convex functions.

Useful patterns to borrow:

- An API factory that lets users export only the functions they need.
- Explicit auth callback injection.
- Optional `getUser` callback for app-specific user display data.
- Hook points such as `onBeforeCreateOrganization`, `onMemberAdded`, and `onInvitationAccepted`.
- Permission-map documentation that says which operation checks which permission.
- Role allowlists as a defense-in-depth option.
- Pagination for member/team/invitation lists.
- Known-limitations docs that call out scaling and direct-component-call risks.
- Test helpers that register components with `convex-test`.

Patterns not to copy for the default SaaS Kit:

- A second `organizations` table.
- A second `members` table.
- A second invitation lifecycle.
- Tenant component role state beside Better Auth Organization roles.
- React-only UI/provider assumptions.
- A generic organization store as the source of active tenant truth.

Why not copy it directly:

Better Auth Organization already owns the auth-domain tenant model we want: organizations, members, invitations, roles, active organization, and important invariants such as last-owner protection. Using `convex-tenants` beside it would mean two systems can disagree about who belongs to an organization.

### `convex-authz` Learning

`convex-authz` is a serious authorization component. It supports:

- RBAC
- ABAC
- ReBAC
- scoped permissions
- direct allow/deny overrides
- expiring grants
- custom tenant-defined roles
- audit logs
- precomputed `effectivePermissions`, `effectiveRoles`, and `effectiveRelationships`
- `recomputeUser()` / sync flows after role definition changes
- tenant-isolated indexes with `tenantId` as the leading dimension

Useful patterns to borrow:

- Type-safe permission definitions.
- A clear distinction between tenant partitioning and resource scope.
- Tenant id as the first index field on tenant-owned product data.
- Rebuild/sync commands for any derived authorization state.
- Explicit limits for bulk operations.
- Advanced custom-role semantics where tenant admins compose only from a provider-defined permission whitelist.
- Strong tests for cross-tenant isolation.

Patterns not to copy for the default SaaS Kit:

- Precomputed permission tables.
- Role assignment tables.
- Permission override tables.
- Relationship graph tables.
- ABAC/ReBAC as default starter concepts.
- A second audit log for product authorization.
- A default dependency on `convex-authz`.

Why not make it the default:

The default Better Auth Organization path already gives us organization roles and `auth.api.hasPermission()`. That is enough for most SaaS apps. `convex-authz` buys O(1) indexed permission checks and richer models, but it also introduces derived state, recompute workflows, more tables, more operational contracts, and another authorization authority.

### Component Decision

Default SaaS Kit:

- Use the Better Auth local Convex component.
- Do not add `convex-tenants`.
- Do not add `convex-authz`.
- Generate userland Convex helpers that call Better Auth permission APIs.

Advanced recipe:

- Consider `convex-authz` only when the app has a real requirement for ABAC, ReBAC, direct permission overrides, custom tenant-defined roles beyond Better Auth dynamic roles, or O(1) permission lookups at large scale.
- Do not combine `convex-authz` with Better Auth roles without a single explicit source-of-truth decision.
- If `convex-authz` is used, document the rebuild story and prove cross-tenant isolation with tests.

Hard stop:

- Do not put `convex-tenants` beside Better Auth Organization in the same default template.
- Do not mirror Better Auth memberships into an authz/tenant component. If an advanced architecture needs another component, it must choose one canonical source and delete the competing path.

### Userland Factory Pattern To Borrow

The best reusable pattern from `convex-tenants` is not the tenant component itself. It is the API factory shape:

- user wires auth once
- user chooses which functions to export
- hooks stay in userland
- generated functions are normal Convex functions
- domain policy stays visible and editable

For the SaaS Kit, this should become generated userland code rather than a hidden tenant component.

Example shape:

```ts
// convex/lib/saasAuthz.ts
import { ConvexError } from 'convex/values'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import { authComponent, createAuth } from '../auth'

type Ctx = QueryCtx | MutationCtx

export function createSaasAuthzHelpers() {
  async function requireOrgPermission(
    ctx: Ctx,
    organizationId: string,
    permissions: {
      project?: Array<'create' | 'read' | 'update' | 'delete'>
      billing?: Array<'read' | 'manage'>
    },
  ) {
    const { auth, headers } = await authComponent.getAuth(createAuth, ctx)

    const result = await auth.api.hasPermission({
      headers,
      body: {
        organizationId,
        permissions,
      },
    })

    if (!result.success) {
      throw new ConvexError({
        code: 'FORBIDDEN',
        message: 'Missing organization permission',
      })
    }

    return { auth, headers }
  }

  return {
    requireOrgPermission,
  }
}
```

Then product code imports the generated helper:

```ts
// convex/projects.ts
import { mutation } from './_generated/server'
import { v } from 'convex/values'
import { createSaasAuthzHelpers } from './lib/saasAuthz'

const { requireOrgPermission } = createSaasAuthzHelpers()

export const create = mutation({
  args: {
    organizationId: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    await requireOrgPermission(ctx, args.organizationId, {
      project: ['create'],
    })

    return await ctx.db.insert('projects', {
      organizationId: args.organizationId,
      name: args.name,
      createdAt: Date.now(),
    })
  },
})
```

This gives us reusable structure without owning the app's tenant tables or product domain.

## Better Auth Plugin Or Own Pattern

There are two possible ways to package more reusable SaaS behavior:

1. Build a Better Auth plugin.
2. Build our own generated Convex/Nuxt pattern on top of official Better Auth plugins.

Use both only where they fit. Do not force everything into a Better Auth plugin.

### What A Better Auth Plugin Is Good For

Better Auth plugins can add:

- auth routes
- Better Auth component schema
- user/session additional fields
- request middleware
- hooks before or after Better Auth endpoints
- rate limits
- trusted origins
- typed client plugin methods through `$InferServerPlugin`

This is excellent for auth-domain capabilities.

Good Better Auth plugin candidates:

- extra auth-domain metadata fields
- auth-domain lifecycle hooks
- custom auth endpoints that only read/write Better Auth component tables
- a future schema-light `betterConvexSaas()` convenience plugin if it only improves Better Auth ergonomics
- client plugin wrappers for auth-domain routes

### What A Better Auth Plugin Is Bad For

A Better Auth plugin should not own product-domain authorization for our SaaS Kit.

Reasons:

- Product data lives in app Convex tables, not Better Auth component tables.
- Product mutations need Convex transaction semantics with product writes and product audit rows.
- Better Auth plugin schema would add another component-owned domain if it stores product permissions or product resources.
- Product permissions are app-specific; putting them in a reusable plugin creates the wrong abstraction.
- Plugin endpoints are HTTP auth routes; product mutations should stay Convex functions.

Bad Better Auth plugin candidates:

- `projects` or other product tables
- product audit log tables
- generic tenant product authorization tables
- app-specific permission DSLs
- wrappers that hide whether authorization is enforced in Convex

### Recommended Split

Default SaaS Kit:

- Compose official Better Auth plugins: `organization()`, `admin()`, `twoFactor()`, `emailOTP()`, `magicLink()`, `@better-auth/api-key`.
- Generate userland Convex helpers such as `requireOrgPermission()`.
- Generate Nuxt composables around `createBetterConvexAuthClient()`.
- Keep product writes in Convex functions.

Optional future Better Auth plugin:

- Only build one if we discover repeated auth-domain boilerplate that cannot be solved cleanly with config factories or Nuxt composables.
- Keep it schema-light by default.
- Do not make it a second source of product permissions.

Preferred near-term API shape:

```ts
// convex/auth.ts
import { organization } from 'better-auth/plugins'
import { createSaasAccessControl, createSaasRoles } from './lib/saasRoles'

const ac = createSaasAccessControl({
  project: ['create', 'read', 'update', 'delete'],
  billing: ['read', 'manage'],
})

const roles = createSaasRoles(ac, {
  owner: {
    project: ['create', 'read', 'update', 'delete'],
    billing: ['read', 'manage'],
  },
  admin: {
    project: ['create', 'read', 'update', 'delete'],
    billing: ['read'],
  },
  member: {
    project: ['create', 'read'],
  },
  viewer: {
    project: ['read'],
  },
})

export const authOptions = {
  plugins: [
    organization({
      ac,
      roles,
    }),
  ],
}
```

Then product enforcement stays in Convex:

```ts
await requireOrgPermission(ctx, organizationId, {
  project: ['create'],
})
```

Decision:

- Do our own generated pattern for the default SaaS Kit.
- Use Better Auth plugins as the underlying auth-domain engine.
- Consider a custom Better Auth plugin later only for auth-domain DX, not product authorization.

## Ownership Split

The product boundary should stay simple:

```txt
Library = integration primitives
Templates = product patterns
App = product semantics
```

This split keeps the core library reusable while allowing starters to be opinionated and useful.

### Library Scope

Package: `better-convex-nuxt`

The core library should include:

- Nuxt module setup for Convex.
- Convex client injection.
- SSR query support.
- Realtime query composables.
- Mutation and action composables.
- Pagination and storage helpers.
- Better Auth auth proxy support.
- Convex JWT/session sync.
- `useConvexAuth()`.
- `useConvexUser()`.
- `createBetterConvexAuthClient()`.
- Vue-safe Better Auth client handling.
- Auth pending/unauthenticated helpers.
- Light config diagnostics.
- Optional UI-only capability helper, currently `createPermissions()`.
- Docs for Better Auth local component setup.

The core library should not include:

- app-owned `organizations` tables
- app-owned `memberships` tables
- product tables such as `projects`, `files`, or `fileShares`
- `requireFileAccess()`
- generic tenant engines
- generic sharing engines
- generic SaaS authorization frameworks
- product audit schemas
- billing models

### Optional Add-On Scope

If we later add a package such as:

```txt
@better-convex-nuxt/saas
```

it should stay thin and composable.

Acceptable add-on helpers:

```ts
createSaasAuthClient()
createOrganizationActions()
createApiKeyActions()
createAdminActions()
```

These helpers may wrap Better Auth client APIs and improve Nuxt ergonomics. They must not own tenant tables, product authorization, or product data.

### Template Scope

Templates should include generated, editable app code:

- `convex/auth.ts`
- `convex/betterAuth/*`
- `convex/schema.ts`
- `convex/lib/requireOrgPermission.ts`
- `convex/lib/audit.ts`
- product-specific Convex functions
- product-specific tables
- app composables
- pages/components
- scenario tests
- feedback scripts

Template code is intentionally userland. It is meant to be inspected, edited, deleted, and adapted.

### Template Examples

`team-saas` should include:

- Better Auth Organization setup.
- Static roles.
- Organization actions.
- Member/invite UI.
- `requireOrgPermission()`.
- Project example.
- Audit events.
- Security scenarios.

`storage-saas` should include:

- `files` table.
- `fileShares` table.
- `publicLinks` table.
- upload flow.
- `requireFileAccess()`.
- file browser UI.
- sharing UI.
- storage security tests.

`api-saas` should include:

- Better Auth API key setup.
- predefined key configs.
- server-side `verifyApiKey()`.
- API route example.
- API key audit events.
- wrong-org/read-only/deleted-key tests.

`admin-security` should include:

- Better Auth Admin.
- first-admin bootstrap.
- ban/unban.
- impersonation.
- TOTP.
- OTP/magic link.
- security tests.

`agentic-saas` should include:

- Convex Agent component setup.
- app-owned `agentRuns`.
- app-owned `agentAuditEvents`.
- optional app-owned `agentApprovals` only when built-in tool approval is not enough.
- assistant thread UI.
- delegated tool execution.
- human approval UI.
- usage tracking.
- rate limiting.
- scenario tests for cross-tenant isolation, capability limits, revocation, and approval checks.

### App Scope

The application owns:

- product data model
- permission names
- role policy
- file/folder semantics
- sharing semantics
- billing rules
- audit requirements
- admin policy
- public link rules
- retention/deletion behavior
- external identity choices

The app may keep template code as-is, simplify it, or replace it entirely. The library should continue working either way.

### Core Rule

Do not move product semantics from templates into the runtime library.

The library provides:

```ts
useConvexQuery()
useConvexMutation()
useConvexAuth()
createBetterConvexAuthClient()
serverConvexQuery()
serverConvexMutation()
```

Templates compose those primitives into real app patterns.

## Agentic Track

Agents should become an official track in the SaaS Kit, but not a second framework and not a privileged side door.

The right split:

```txt
Convex Agent component = agent infrastructure
Better Auth = human identity, organizations, roles, sessions, API keys
App Convex code = product permissions, delegation, audit, and final writes
Nuxt = thread UI, approval UI, and status display
```

The Convex Agent component is the right foundation because it already handles the hard agent infrastructure: persisted/live-updating threads and messages, tools, human-in-the-loop approvals, long-running workflows, usage tracking, and rate limiting. We should not rebuild that in `better-convex-nuxt`.

### Research Inputs

Convex Agents provide:

- persisted message history that live-updates on clients
- agents that run inside Convex actions
- shared threads across users and agents
- tool calls for reading/writing database state, external APIs, web search, and human-in-the-loop operations
- custom tool context such as `orgId`
- explicit warning that scheduled/workflow contexts may not have an authenticated user
- tool approval for dangerous operations
- usage tracking for billing by user/team/project
- rate limiting for message sends and token usage
- workflows for durable, retryable, long-lived multi-step agent work
- human agent patterns for support-style handoff

Source docs:

- https://docs.convex.dev/agents/overview
- https://docs.convex.dev/agents/tools
- https://docs.convex.dev/agents/tool-approval
- https://docs.convex.dev/agents/threads
- https://docs.convex.dev/agents/workflows
- https://docs.convex.dev/agents/human-agents
- https://docs.convex.dev/agents/usage-tracking
- https://docs.convex.dev/agents/rate-limiting

Local starters already point in this direction:

- `starters/vertical-ai` treats agent output as draft state that must be reviewed before becoming canonical product state.
- `starters/mcp-agent` treats service actors, product approvals, credentials, MCP tools, and audit as product-domain concerns.

Both starters should be refactored after the Better Auth Organization cutover. They currently teach useful product patterns, but they should stop owning independent app organizations and memberships.

### Product Decision

Add `agentic-saas` as a template track.

Do not add agent semantics to the core runtime library.

Do not build a generic agent permission framework.

The template should provide editable userland patterns for:

- agents acting as assistants
- agents acting on behalf of a user
- agents creating drafts for human approval
- agents executing bounded product tools
- human agents joining the same thread
- durable workflows where needed
- usage tracking by organization and user
- rate limiting by organization and user
- audit trails that distinguish human actors, service actors, and agent actors

The sellable message:

> Build tenant-aware SaaS where AI agents can participate as first-class product actors, with explicit delegation, approvals, audit, and server-enforced permissions.

### Core Principle

Agents should never receive ambient authority.

An agent is not "logged in" as a user in the same way the browser is. An agent run has an explicit delegation record:

- who started it
- which organization it belongs to
- what it is allowed to do
- which thread it controls
- whether it is still active
- which user, if any, it is acting on behalf of

Every tool call checks that delegation record before touching product data.

### Agent Actor Model

Use a product actor union in app code:

```ts
export type ProductActor =
  | {
      kind: 'user'
      authUserId: string
    }
  | {
      kind: 'agent'
      agentRunId: Id<'agentRuns'>
      delegatedByAuthUserId: string
    }
  | {
      kind: 'apiKey'
      keyId: string
    }
  | {
      kind: 'system'
      reason: string
    }
```

This actor is for product audit and product invariants. It is not a replacement for Better Auth membership checks.

Default rule:

- Human user starts the run with Better Auth permission.
- The app stores a bounded delegation in `agentRuns`.
- Tools check the run, the organization, and the allowed capability.
- Product writes still go through normal Convex helpers.
- Audit logs include both `actor.kind === 'agent'` and `delegatedByAuthUserId`.

### Minimal Schema Pattern

The default agentic template should add only the canonical product records it needs:

```ts
// convex/schema.ts
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  agentRuns: defineTable({
    organizationId: v.string(),
    threadId: v.string(),
    agentName: v.string(),
    status: v.union(
      v.literal('active'),
      v.literal('paused'),
      v.literal('completed'),
      v.literal('revoked'),
      v.literal('failed'),
    ),
    mode: v.union(
      v.literal('assistant'),
      v.literal('delegated'),
      v.literal('service'),
    ),
    startedByAuthUserId: v.string(),
    actingAsAuthUserId: v.optional(v.string()),
    capabilities: v.array(
      v.union(
        v.literal('files:read'),
        v.literal('files:draft'),
        v.literal('files:share'),
        v.literal('files:delete'),
      ),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
    expiresAt: v.optional(v.number()),
  })
    .index('by_thread', ['threadId'])
    .index('by_organization', ['organizationId'])
    .index('by_started_by', ['startedByAuthUserId']),

  agentAuditEvents: defineTable({
    organizationId: v.string(),
    agentRunId: v.id('agentRuns'),
    actor: v.object({
      kind: v.literal('agent'),
      delegatedByAuthUserId: v.string(),
    }),
    action: v.string(),
    resourceType: v.string(),
    resourceId: v.optional(v.string()),
    outcome: v.union(v.literal('allowed'), v.literal('denied')),
    reason: v.optional(v.string()),
    createdAt: v.number(),
  }).index('by_organization_created', ['organizationId', 'createdAt']),
})
```

Do not add an `agents` membership table by default.

Do not mirror Better Auth users or memberships.

Do not store LLM messages in app tables unless product-specific indexing or compliance requires it. The Agent component owns thread/message persistence.

### Start Run Pattern

The user starts a run through a normal Convex function. That function checks Better Auth organization permission before creating the delegation.

```ts
// convex/agentRuns.ts
import { v } from 'convex/values'
import { mutation } from './_generated/server'
import { createThread } from '@convex-dev/agent'
import { components } from './_generated/api'
import { createSaasAuthzHelpers } from './lib/saasAuthz'

const { requireOrgPermission, requireAuthUser } = createSaasAuthzHelpers()

export const startFileAssistant = mutation({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const { authUserId } = await requireAuthUser(ctx)

    await requireOrgPermission(ctx, args.organizationId, {
      file: ['read', 'create'],
    })

    const threadId = await createThread(ctx, components.agent, {
      userId: authUserId,
      title: 'File assistant',
    })

    const now = Date.now()
    const agentRunId = await ctx.db.insert('agentRuns', {
      organizationId: args.organizationId,
      threadId,
      agentName: 'file-assistant',
      status: 'active',
      mode: 'delegated',
      startedByAuthUserId: authUserId,
      actingAsAuthUserId: authUserId,
      capabilities: ['files:read', 'files:draft'],
      createdAt: now,
      updatedAt: now,
    })

    return { agentRunId, threadId }
  },
})
```

The important part is not the specific table shape. The important part is that the app stores explicit delegation before any tool can act.

### Tool Guard Pattern

Each tool calls one helper before touching product data.

```ts
// convex/lib/agentAuthz.ts
import { ConvexError, v } from 'convex/values'
import type { ActionCtx } from '../_generated/server'
import { internal } from '../_generated/api'
import type { Id } from '../_generated/dataModel'

export const vAgentCapability = v.union(
  v.literal('files:read'),
  v.literal('files:draft'),
  v.literal('files:share'),
  v.literal('files:delete'),
)

export async function requireAgentCapability(
  ctx: ActionCtx,
  args: {
    agentRunId: Id<'agentRuns'>
    organizationId: string
    capability: 'files:read' | 'files:draft' | 'files:share' | 'files:delete'
  },
) {
  const run = await ctx.runQuery(internal.agentRuns.getActiveForTool, {
    agentRunId: args.agentRunId,
  })

  if (!run || run.status !== 'active') {
    throw new ConvexError({ code: 'FORBIDDEN', message: 'Agent run is not active' })
  }

  if (run.organizationId !== args.organizationId) {
    throw new ConvexError({ code: 'FORBIDDEN', message: 'Wrong organization' })
  }

  if (!run.capabilities.includes(args.capability)) {
    throw new ConvexError({ code: 'FORBIDDEN', message: 'Capability not delegated' })
  }

  return {
    run,
    actor: {
      kind: 'agent' as const,
      agentRunId: args.agentRunId,
      delegatedByAuthUserId: run.startedByAuthUserId,
    },
  }
}
```

This helper does not replace product authorization. It proves the agent was delegated this class of action. The product mutation still verifies the resource belongs to the organization and enforces product invariants.

### Tool Pattern

Tools should be small adapters over normal Convex product functions.

```ts
// convex/agentTools.ts
import { createTool } from '@convex-dev/agent'
import { z } from 'zod/v4'
import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { requireAgentCapability } from './lib/agentAuthz'

export const draftFileShareTool = createTool({
  description: 'Create a draft file sharing proposal for a user to review.',
  args: z.object({
    agentRunId: z.string().describe('The delegated agent run id'),
    organizationId: z.string().describe('The organization id'),
    fileId: z.string().describe('The file id'),
    email: z.string().email().describe('The recipient email'),
    role: z.enum(['viewer', 'editor']).describe('The proposed access role'),
  }),
  handler: async (ctx, args): Promise<{ draftId: string }> => {
    const { actor } = await requireAgentCapability(ctx, {
      agentRunId: args.agentRunId as Id<'agentRuns'>,
      organizationId: args.organizationId,
      capability: 'files:draft',
    })

    const draftId = await ctx.runMutation(api.fileShareDrafts.create, {
      organizationId: args.organizationId,
      fileId: args.fileId,
      email: args.email,
      role: args.role,
      actor,
    })

    return { draftId }
  },
})
```

Default tools should create drafts, not directly mutate canonical product state, until the template proves the safer shape.

### Approval Pattern

Use Convex Agent tool approval for dangerous operations:

```ts
export const deleteFileTool = createTool({
  description: 'Delete a file.',
  args: z.object({
    agentRunId: z.string(),
    organizationId: z.string(),
    fileId: z.string(),
  }),
  needsApproval: () => true,
  handler: async (ctx, args): Promise<{ deleted: true }> => {
    const { actor } = await requireAgentCapability(ctx, {
      agentRunId: args.agentRunId as Id<'agentRuns'>,
      organizationId: args.organizationId,
      capability: 'files:delete',
    })

    await ctx.runMutation(api.files.remove, {
      organizationId: args.organizationId,
      fileId: args.fileId,
      actor,
    })

    return { deleted: true }
  },
})
```

Tool approval is necessary but not sufficient. Approval answers "did a person approve this tool call?" It does not answer "does this user have permission to approve this resource in this organization?" The approval mutation must still call `requireOrgPermission()`.

### Frontend Shape

Nuxt should expose a simple app-level experience:

```vue
<script setup lang="ts">
const organizationId = useActiveOrganizationId()

const startAssistant = useConvexMutation(api.agentRuns.startFileAssistant)
const sendMessage = useConvexAction(api.fileAssistant.sendMessage)

const run = ref<{ agentRunId: string; threadId: string } | null>(null)

async function start() {
  run.value = await startAssistant.mutate({ organizationId: organizationId.value })
}

async function submit(prompt: string) {
  if (!run.value) return
  await sendMessage.execute({
    organizationId: organizationId.value,
    agentRunId: run.value.agentRunId,
    threadId: run.value.threadId,
    prompt,
  })
}
</script>

<template>
  <AgentThread
    v-if="run"
    :thread-id="run.threadId"
    @submit="submit"
  />
  <button v-else @click="start">
    Start assistant
  </button>
</template>
```

`AgentThread` can live in the starter/template. A future optional add-on may provide generic Vue composables if they are thin wrappers around Agent component queries and actions.

### What Belongs In The Library

Core `better-convex-nuxt`:

- no agent actor model
- no agent tables
- no agent permission DSL
- no tool framework
- no product-specific approval engine

Possible thin generic helpers later:

```ts
useConvexAction()
useStreamingAction()
useAgentThreadMessages()
useAgentToolApprovals()
```

Only add these if they are generic Nuxt integration helpers. They must not encode SaaS policy.

### What Belongs In Templates

`agentic-saas` template:

- `convex/agents.ts`
- `convex/agentRuns.ts`
- `convex/agentTools.ts`
- `convex/lib/agentAuthz.ts`
- `convex/lib/agentAudit.ts`
- app-specific product tools
- thread UI
- approval UI
- usage tracking table
- rate limit setup
- scenario tests

`vertical-ai` template:

- draft-first workflow
- review queue
- human approval before canonical writes
- audit of accepted/rejected generated changes

`mcp-agent` template:

- service actor pattern
- explicit credential ownership
- product approvals
- MCP as transport only
- no direct product writes from MCP tools without normal product authorization

### Agent Security Footguns And Mitigations

| Footgun | Mitigation |
| --- | --- |
| Agent tools call internal mutations that bypass normal product checks. | Tools call normal product functions or shared product helpers that enforce org/resource invariants. |
| Agent run only stores `threadId`, so tools can be replayed against another organization. | Store `organizationId` on `agentRuns` and require every tool arg to match it. |
| Scheduled/workflow execution assumes `ctx.auth` is still the user. | Store explicit delegation in `agentRuns`; workflows use that record, not ambient auth. |
| Agent can use every tool registered on the Agent instance. | Pass bounded tools at run/thread/generation time and check `capabilities` inside each tool. |
| Human approval is treated as authorization. | Approval mutation checks Better Auth org permission before approving. |
| Prompt injection convinces the model to exfiltrate or mutate data. | Tool schemas and server-side guards define what is possible; prompts are never security boundaries. |
| Agent messages leak secrets or private resource contents. | Redact tool outputs; return IDs/summaries instead of secrets; keep credentials out of thread history. |
| Agent keeps acting after the user leaves the org or is demoted. | Re-check Better Auth permission for high-risk actions or revoke active runs on membership/role changes when hooks are available. |
| Usage billing is attributed only to the thread user. | Usage handler records `organizationId`, `agentRunId`, `startedByAuthUserId`, model, provider, and tokens. |
| Rate limiting is only per user. | Add per-organization and global token/message limits. |
| Agent audit looks like a human directly performed the action. | Product audit stores `actor.kind = 'agent'` and `delegatedByAuthUserId`. |
| Agent thread visibility trusts Agent component metadata only. | App queries verify thread belongs to an active `agentRun` in the requested organization. |

### Scenario Tests

The template should ship tests that prove the security model:

- outsider cannot start an agent run for another organization
- member without `file:create` cannot start a file-writing agent
- agent cannot call a tool outside its delegated capability list
- agent cannot access a file from another organization
- revoked agent run cannot call tools
- destructive tool pauses for approval
- unauthorized user cannot approve a pending tool call
- approved destructive tool records actor and delegator
- usage is attributed to user, organization, and agent run
- rate limit blocks excessive messages
- service/MCP actor cannot cross organizations

### Direction For Existing Agent Starters

Refactor `starters/vertical-ai` and `starters/mcp-agent` into this model:

1. Remove app-owned organization and membership truth.
2. Use Better Auth Organization ids on product rows.
3. Add `agentRuns` as the only app-owned agent delegation record.
4. Keep agent output as drafts by default.
5. Require human approval for canonical writes that are destructive, externally visible, or expensive.
6. Keep MCP as a transport adapter, not as a domain authority.
7. Add scenario tests before adding more agent features.

## Packaging Strategy

### Package Layers

Use layers, not one giant framework.

#### Layer 1: Core Runtime

Package: `better-convex-nuxt`

This remains the main Nuxt module.

It should include:

- Convex client wiring.
- SSR query support.
- Realtime queries.
- Mutations and actions.
- Convex storage helpers.
- Better Auth token sync.
- Auth proxy utilities.
- `useConvexAuth()`.
- `useConvexUser()`.
- `createBetterConvexAuthClient()`.
- Vue-safe Better Auth client handling.
- Auth pending/unauthenticated helpers.
- Diagnostics for common auth config problems.

It should not include:

- Built-in tenant tables.
- Built-in SaaS roles.
- Built-in product permissions.
- A second authorization system.
- Better Auth plugin schema assumptions.

#### Layer 2: SaaS Kit Surface

Near term, keep this inside the repo as docs, templates, and optional imports.

Later package option:

```txt
@better-convex-nuxt/saas
```

The old `b2b` wording is accurate for many customers, but it is too narrow as the top-level product name. Use B2B as a use case, not as the architecture label.

This package should be thin. It can include:

- typed client helper factories
- UI capability composable patterns
- route/action wrappers
- shared TypeScript types
- scaffolding templates
- test helpers

It should not own the app's authorization policy. The app must define its product resources and permission vocabulary.

#### Layer 3: CLI And Template Distribution

Package:

```txt
create-better-convex-nuxt
```

or:

```txt
better-convex-nuxt add <capability>
better-convex-nuxt doctor
```

The CLI should copy generated userland code into the app instead of hiding domain code inside a runtime abstraction.

Example commands:

```bash
pnpm dlx create-better-convex-nuxt@latest my-app --template team-saas
pnpm dlx better-convex-nuxt@latest add better-auth-local
pnpm dlx better-convex-nuxt@latest add saas-organization
pnpm dlx better-convex-nuxt@latest add api-keys
pnpm dlx better-convex-nuxt@latest doctor saas
```

The important part: `add` should be explicit and reversible. It should show files it creates, not silently mutate app architecture.

## Opt-In Model

The developer should be able to adopt the stack in stages.

### Option 0: Convex Only

Use when the app does not need auth yet.

```ts
export default defineNuxtConfig({
  modules: ['better-convex-nuxt'],
  convex: {
    url: process.env.NUXT_PUBLIC_CONVEX_URL,
  },
})
```

### Option 1: Better Auth Login

Use when the app needs auth but not organizations.

Included:

- Better Auth route proxy.
- Convex JWT sync.
- `createBetterConvexAuthClient()`.
- optional app `users` projection.

Not included:

- tenant roles
- organization membership
- API keys
- admin controls

### Option 2: Team SaaS

Use when the app needs organizations and roles.

Adds:

- local Better Auth Convex component
- `organization()`
- static roles
- product permission examples
- Convex `requireOrgPermission()` helper
- hard-cutover schema shape
- audit log pattern

### Option 3: API SaaS

Use when customers need API keys.

Adds:

- `@better-auth/api-key`
- organization-owned key configs
- server-side API key verification
- Convex HTTP route example
- product audit actor format, such as `apiKey:<apiKeyId>`

### Option 4: Admin And Security

Use when the app needs operator controls and hardened auth.

Adds:

- `admin()`
- first-admin bootstrap guidance
- TOTP two-factor
- email OTP
- magic link
- real delivery integration hooks

### Option 5: Platform / Advanced Identity

Use only after product requirements prove it.

Potential capabilities:

- OIDC provider
- device authorization
- MCP auth
- external enterprise SSO boundary
- SCIM

These should stay recipe-gated until fully verified.

### Option 6: Agentic SaaS

Use when agents need to participate inside the tenant-aware product.

Adds:

- Convex Agent component
- app-owned `agentRuns`
- bounded delegated capabilities
- agent tools over normal product functions
- approval UI for risky operations
- usage tracking by organization/user/run
- rate limiting by organization/user/run
- agent audit events

Do not add:

- agent-owned membership tables
- agent-specific product mutation bypasses
- generic agent permission framework
- autonomous destructive writes by default.

## Recommended Template Set

Templates should be complete enough to run, but small enough to inspect.

### `base`

Purpose:

- Nuxt + Convex.
- No auth.
- Good for public apps, demos, and fast prototypes.

Includes:

- queries
- mutations
- storage example
- SSR example
- deployment docs

### `auth`

Purpose:

- consumer app or internal tool with login.

Includes:

- Better Auth setup
- Convex JWT sync
- app `users` projection
- protected page
- sign-in/sign-out

No organizations.

### `team-saas`

Purpose:

- canonical tenant-aware SaaS app.

Includes:

- local Better Auth Convex component
- Better Auth Organization
- static roles: `owner`, `admin`, `member`, `viewer`
- product permission resource, for example `project`
- product table with `organizationId: v.string()`
- Convex-side `requireOrgPermission()`
- audit events
- invite flow
- member management
- invariant tests

Does not include:

- app-owned organization tables
- app-owned membership tables
- dynamic roles by default
- teams inside organizations by default

### `agency`

Purpose:

- SaaS app with customer/client delegation.

Potential shape:

- Better Auth organizations remain tenant root.
- Product tables model clients/accounts/projects.
- Delegation lives in product tables only if it is product-domain state.
- Better Auth membership remains tenant membership.

This template should only be added after the team SaaS cutover is stable.

### `api-saas`

Purpose:

- product exposes an API to customers.

Includes:

- organization-owned API keys
- predefined API key configs
- server-side key verification
- HTTP product route
- audit events with API key actor

Avoid:

- public `/api/auth/api-key/verify` until route exposure is intentionally supported
- ad hoc per-key permissions from Convex mutations until the dynamic import issue is resolved

### `admin-security`

Purpose:

- apps that need operator/admin user management and stronger sign-in.

Includes:

- Better Auth Admin
- first-admin bootstrap
- ban/unban
- impersonation
- TOTP
- email OTP or magic link
- delivery provider placeholders

### `platform-auth`

Purpose:

- API platform, developer platform, or MCP-oriented app.

Keep experimental until:

- replacement OAuth provider path is not deprecated
- token introspection/revocation works
- product-route authorization from provider tokens is proven
- Nuxt proxy/callback URL behavior is proven

## Proposed File Layout For SaaS Templates

```txt
convex/
  auth.config.ts
  auth.ts
  http.ts
  schema.ts
  betterAuth/
    convex.config.ts
    auth.ts
    adapter.ts
    generatedSchema.ts
    schema.ts
  lib/
    authz.ts
    audit.ts
  projects.ts
  auditEvents.ts

app/
  composables/
    useSaasAuthClient.ts
    useOrganizationActions.ts
    useProductCapabilities.ts
  pages/
    dashboard.vue
    organizations/
      index.vue
      [organizationId].vue
```

Keep domain helpers in `convex/lib/` so the app can change them.

## Core Code Patterns

### Better Auth Local Component

The SaaS templates need local component install because schema-changing plugins require generated component tables.

```ts
// convex/auth.ts
import { createClient, type GenericCtx } from '@convex-dev/better-auth'
import { convex } from '@convex-dev/better-auth/plugins'
import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { createAccessControl, organization } from 'better-auth/plugins'

import { components, internal } from './_generated/api'
import type { DataModel } from './_generated/dataModel'
import authConfig from './auth.config'
import authSchema from './betterAuth/schema'

export const authComponent = createClient<DataModel, typeof authSchema>(
  components.betterAuth,
  {
    local: { schema: authSchema },
    authFunctions: internal.auth,
  },
)

export const saasAccessControl = createAccessControl({
  organization: ['update', 'delete'],
  member: ['create', 'update', 'delete'],
  invitation: ['create', 'cancel'],
  project: ['create', 'read', 'update', 'delete'],
})

export const ownerRole = saasAccessControl.newRole({
  organization: ['update', 'delete'],
  member: ['create', 'update', 'delete'],
  invitation: ['create', 'cancel'],
  project: ['create', 'read', 'update', 'delete'],
})

export const adminRole = saasAccessControl.newRole({
  organization: ['update'],
  member: ['create', 'update', 'delete'],
  invitation: ['create', 'cancel'],
  project: ['create', 'read', 'update', 'delete'],
})

export const memberRole = saasAccessControl.newRole({
  organization: [],
  member: [],
  invitation: [],
  project: ['create', 'read'],
})

export const viewerRole = saasAccessControl.newRole({
  organization: [],
  member: [],
  invitation: [],
  project: ['read'],
})

export function createAuthOptions(ctx: GenericCtx<DataModel>) {
  return {
    baseURL: process.env.SITE_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    database: authComponent.adapter(ctx),
    emailAndPassword: { enabled: true },
    plugins: [
      organization({
        ac: saasAccessControl,
        roles: {
          owner: ownerRole,
          admin: adminRole,
          member: memberRole,
          viewer: viewerRole,
        },
        requireEmailVerificationOnInvitation:
          process.env.ALLOW_TEST_RESET !== 'true',
      }),
      convex({ authConfig }),
    ],
    advanced: {
      database: {
        generateId: false,
      },
    },
  } satisfies BetterAuthOptions
}

export function createAuth(ctx: GenericCtx<DataModel>) {
  return betterAuth(createAuthOptions(ctx))
}
```

### Product Schema

Product tables should reference Better Auth ids as strings.

```ts
// convex/schema.ts
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  users: defineTable({
    authUserId: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_auth_user_id', ['authUserId']),

  projects: defineTable({
    organizationId: v.string(),
    name: v.string(),
    createdByAuthUserId: v.string(),
    createdAt: v.number(),
  }).index('by_org', ['organizationId']),

  auditEvents: defineTable({
    organizationId: v.string(),
    actorId: v.string(),
    action: v.string(),
    resourceType: v.string(),
    resourceId: v.optional(v.string()),
    createdAt: v.number(),
  }).index('by_org_created', ['organizationId', 'createdAt']),
})
```

Do not include app-owned `organizations`, `memberships`, or `invitations` in the SaaS template.

### Convex Authorization Helper

This should be generated into userland because product permission names are app-specific.

```ts
// convex/lib/authz.ts
import { ConvexError } from 'convex/values'
import type { QueryCtx, MutationCtx } from '../_generated/server'
import { authComponent, createAuth } from '../auth'

type AuthzCtx = QueryCtx | MutationCtx

type ProductPermissions = {
  project?: Array<'create' | 'read' | 'update' | 'delete'>
}

export async function requireOrgPermission(
  ctx: AuthzCtx,
  organizationId: string,
  permissions: ProductPermissions,
) {
  const { auth, headers } = await authComponent.getAuth(createAuth, ctx)

  const result = await auth.api.hasPermission({
    headers,
    body: {
      organizationId,
      permissions,
    },
  })

  if (!result.success) {
    throw new ConvexError({
      code: 'FORBIDDEN',
      message: 'Missing organization permission',
    })
  }

  return { auth, headers }
}
```

### Product Mutation

```ts
// convex/projects.ts
import { mutation, query } from './_generated/server'
import { v } from 'convex/values'
import { requireOrgPermission } from './lib/authz'

export const list = query({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireOrgPermission(ctx, args.organizationId, {
      project: ['read'],
    })

    return await ctx.db
      .query('projects')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .collect()
  },
})

export const create = mutation({
  args: {
    organizationId: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const { auth } = await requireOrgPermission(ctx, args.organizationId, {
      project: ['create'],
    })

    const session = await auth.api.getSession({
      headers: await authComponent.getHeaders(ctx),
    })

    if (!session?.user?.id) {
      throw new Error('Missing Better Auth user')
    }

    const now = Date.now()
    const projectId = await ctx.db.insert('projects', {
      organizationId: args.organizationId,
      name: args.name,
      createdByAuthUserId: session.user.id,
      createdAt: now,
    })

    await ctx.db.insert('auditEvents', {
      organizationId: args.organizationId,
      actorId: session.user.id,
      action: 'project.create',
      resourceType: 'project',
      resourceId: projectId,
      createdAt: now,
    })

    return projectId
  },
})
```

Note: the exact session helper should be verified against the local component. The pattern matters: product mutation checks Better Auth permission first, then writes product and audit rows in Convex.

### Nuxt Better Auth Client

```ts
// app/composables/useSaasAuthClient.ts
import { organizationClient } from 'better-auth/client/plugins'
import { createBetterConvexAuthClient } from '#imports'

let client: ReturnType<typeof createClient> | null = null

function createClient() {
  return createBetterConvexAuthClient({
    plugins: [organizationClient()],
  })
}

export function useSaasAuthClient() {
  client ??= createClient()
  return client
}
```

### Organization Actions

```ts
// app/composables/useOrganizationActions.ts
export function useOrganizationActions() {
  const authClient = useSaasAuthClient()

  async function createOrganization(input: { name: string; slug: string }) {
    return await authClient.organization.create({
      name: input.name,
      slug: input.slug,
    })
  }

  async function inviteMember(input: {
    organizationId: string
    email: string
    role: 'admin' | 'member' | 'viewer'
  }) {
    return await authClient.organization.inviteMember({
      organizationId: input.organizationId,
      email: input.email,
      role: input.role,
    })
  }

  return {
    createOrganization,
    inviteMember,
  }
}
```

### Product UI

```vue
<script setup lang="ts">
import { api } from '#convex/api'

const organizationId = ref<string | null>(null)
const name = ref('')

const projects = await useConvexQuery(
  api.projects.list,
  computed(() =>
    organizationId.value
      ? { organizationId: organizationId.value }
      : 'skip',
  ),
)

const createProject = useConvexMutation(api.projects.create)

async function submit() {
  if (!organizationId.value) return
  await createProject({
    organizationId: organizationId.value,
    name: name.value,
  })
  name.value = ''
}
</script>
```

The UI does not decide whether creation is authorized. Convex does.

## Built-In Permissions Recommendation

Current `createPermissions()` should not become the SaaS Kit authorization layer.

Keep it, but narrow its promise:

- It is a UI capability helper.
- It fetches a user-provided permission context.
- It runs a user-provided `checkPermission()`.
- It can hide buttons and redirect after render.
- It is not authoritative.

Recommended changes:

1. Keep `createPermissions()` for compatibility.
2. Rename docs language from "permissions system" to "UI capability helpers".
3. Add a future alias such as `createCapabilities()` if we want clearer naming.
4. Do not add backend policy logic to it.
5. Do not recommend app-owned `users.role` for SaaS templates.

For the SaaS Kit, the main path should be:

```txt
Better Auth Organization roles
  -> Convex requireOrgPermission()
  -> product mutation/query
  -> optional UI capability display
```

## SaaS Kit API Shape

The reusable parts should wrap integration friction, not product policy.

### Good Reusable Parts

These are good candidates for the library or SaaS Kit add-on:

- `createBetterConvexAuthClient()` support for Better Auth plugin clients.
- `useBetterAuthClient()` caching helper pattern.
- `useActiveOrganization()` wrapper around Better Auth session/org APIs.
- `useOrganizationList()`.
- `useOrganizationMembers()`.
- `useInvitationActions()`.
- `useApiKeyActions()`.
- `useAdminActions()`.
- route proxy helpers.
- local component schema setup docs.
- CLI-generated Convex `authz.ts`.
- CLI-generated template tests.
- doctor checks.

### Bad Reusable Parts

These should stay out of the library:

- hardcoded `project` permissions in runtime package
- generic tenant table abstraction
- generic membership mirror
- generic billing model
- generic dynamic role UI
- generic audit schema that every app must use
- generic policy DSL
- generic enterprise SSO bridge

## Example SaaS Kit Usage

If we add an optional SaaS package, it should look like composition, not magic.

```ts
// app/composables/useSaas.ts
import {
  createOrganizationActions,
  createAdminActions,
  createApiKeyActions,
} from '@better-convex-nuxt/saas'
import { organizationClient, adminClient } from 'better-auth/client/plugins'
import { apiKeyClient } from '@better-auth/api-key/client'
import { createBetterConvexAuthClient } from '#imports'

const authClient = createBetterConvexAuthClient({
  plugins: [
    organizationClient(),
    adminClient(),
    apiKeyClient(),
  ],
})

export const useOrganizationActions = createOrganizationActions(authClient)
export const useAdminActions = createAdminActions(authClient)
export const useApiKeyActions = createApiKeyActions(authClient)
```

This is acceptable because Better Auth remains the source of truth. The add-on only improves Nuxt ergonomics.

## CLI Scaffolding Requirements

The CLI should be the main distribution mechanism for reusable SaaS architecture.

### `add better-auth-local`

Creates:

```txt
convex/betterAuth/convex.config.ts
convex/betterAuth/auth.ts
convex/betterAuth/adapter.ts
convex/betterAuth/schema.ts
```

Updates:

```txt
convex/convex.config.ts
convex/auth.ts
convex/http.ts
```

Acceptance:

- local component deploys
- generated schema is committed
- `advanced.database.generateId: false` is configured
- required env vars are documented

### `add saas-organization`

Creates:

```txt
convex/lib/authz.ts
convex/lib/audit.ts
convex/projects.ts
app/composables/useSaasAuthClient.ts
app/composables/useOrganizationActions.ts
```

Updates:

```txt
convex/auth.ts
convex/schema.ts
```

Acceptance:

- Better Auth `organization()` enabled
- static roles configured
- product permissions configured
- no app-owned org/member/invitation tables
- sample product mutation enforces permissions in Convex

### `add api-keys`

Creates:

```txt
convex/apiKeys.ts
convex/http.ts route example
app/composables/useApiKeyActions.ts
```

Acceptance:

- `@better-auth/api-key` installed
- `apikey` schema and indexes present
- server-side `verifyApiKey()` path works
- API key secrets are never copied into app tables
- predefined key configs used

### `doctor saas`

Checks:

- `SITE_URL` configured
- `BETTER_AUTH_SECRET` configured
- local Better Auth component registered
- local schema has expected plugin tables
- required indexes exist
- `/api/auth/sign-up/email` reachable
- `/api/auth/convex/token` reachable
- Better Auth Organization route reachable
- Convex JWT sync works
- app schema does not contain forbidden duplicate tables in hard-cutover templates
- product mutation rejects outsider access

Example output:

```txt
better-convex-nuxt doctor saas

OK  Better Auth local component registered
OK  organization/member/invitation component tables found
OK  Convex token route reachable
OK  product permission helper rejects outsider
WARN app table "memberships" exists. This is a second source of truth for the team-saas template.
FAIL missing index betterAuth.member.organizationId_userId
```

## Verification Requirements

Every SaaS template must ship with tests or feedback scripts that prove invariants.

### Required Tests

For `team-saas`:

- owner can create organization
- owner can invite member
- invite acceptance creates Better Auth member row
- member can perform allowed product action
- viewer cannot create product row
- outsider cannot list or create product row
- last owner cannot be removed
- product audit row is written
- app-owned org/member/invite tables do not exist or remain empty during experiment

For `api-saas`:

- owner can create organization API key
- member with key permission can list keys but cannot create if policy says so
- viewer cannot list keys
- raw API key is not stored in app tables
- server-side key verification works
- reader key cannot write
- writer key cannot write into another organization

For auth hardening:

- TOTP challenge blocks normal sign-in
- backup code is single use
- magic link token is hashed and single use
- OTP is hashed and consumed

## Selling The Template System

### Landing Page Message

Headline:

```txt
Nuxt + Convex for serious SaaS apps
```

Subheadline:

```txt
Use Better Auth for organizations, roles, invitations, admin, MFA, and API keys. Keep product data and authorization invariants in Convex. Start from verified templates and add only what your app needs.
```

Primary bullets:

- Realtime SaaS app foundation.
- SSR-safe auth and Convex token sync.
- Better Auth Organization integration.
- Server-enforced tenant permissions.
- API key product routes.
- Admin and security recipes.
- No duplicate membership tables.

### Developer Pitch

```txt
Most stacks give you login and leave tenant-aware architecture to you.
better-convex-nuxt gives you the full Nuxt + Convex integration path:
auth, tenants, roles, API keys, product authorization, and verification scripts.
```

### Technical Pitch

```txt
Better Auth owns auth-domain truth. Convex owns product-domain truth.
The templates enforce that split with code, tests, and diagnostics.
```

### Why Optional Matters

Different apps need different levels:

- public app: no auth
- consumer app: auth only
- team SaaS: organizations and roles
- API SaaS: API keys
- enterprise app: external identity integration
- platform app: OAuth/device/MCP experiments

The stack should let users start small and add only proven capabilities.

## What We Should Build First

### Milestone 1: Clean Core Story

Actions:

1. Keep `better-convex-nuxt` core focused.
2. Reposition `createPermissions()` as UI capability helper.
3. Update docs to stop presenting app-owned roles as the main SaaS path.
4. Make Better Auth local component docs first-class.

Acceptance:

- docs clearly say frontend checks are display-only
- Better Auth Organization is the recommended SaaS authority
- no docs imply app-owned membership mirrors are preferred for SaaS

### Milestone 2: Hard-Cutover Team Starter

Actions:

1. Convert `starters/team` to local Better Auth component.
2. Enable `organization()`.
3. Delete app-owned `organizations`, `memberships`, and `invitations`.
4. Convert real `projects` to Better Auth organization id strings.
5. Replace `requireOrgAccess()` with `requireOrgPermission()`.
6. Keep product audit events.
7. Add invariant tests.

Acceptance:

- no dual organization path
- no app-owned membership path
- Better Auth owns invitation flow
- Convex product authorization works
- verification suite passes

### Milestone 3: Template Distribution

Actions:

1. Add `create-better-convex-nuxt` or equivalent template command.
2. Ship `base`, `auth`, and `team-saas`.
3. Add `doctor saas`.

Acceptance:

- new app can be created from template
- setup docs fit on one page
- doctor catches missing env and schema problems

### Milestone 4: Advanced SaaS Recipes

Actions:

1. Add `api-saas` after API key warnings are understood or documented.
2. Add `admin-security`.
3. Add delivery-backed email examples.
4. Keep dynamic roles as an advanced recipe.

Acceptance:

- each recipe has a feedback script
- each recipe states what is proven and what is not
- no recipe introduces duplicate auth-domain state

## What We Should Not Build

Do not build:

- a Better Auth replacement
- a second organization system
- a second membership system
- app-owned role mirrors in SaaS templates
- a generic authorization engine
- a generic SaaS domain model
- dynamic roles as the default
- teams inside organizations as the default
- public API key verification until route behavior is intentionally supported
- enterprise SSO/SCIM promises until proven
- compatibility paths for unreleased starter code

If a feature requires mirrored memberships or dual auth databases, stop and redesign.

## Final Recommendation

Package the product as three things:

1. `better-convex-nuxt`: the core Nuxt + Convex + Better Auth integration layer.
2. Verified templates: `base`, `auth`, `team-saas`, `api-saas`, `admin-security`, and later `platform-auth`.
3. A CLI/doctor flow that scaffolds optional SaaS pieces and verifies they work.

Sell it as:

```txt
The fastest way to build real tenant-aware SaaS on Nuxt and Convex, with Better Auth doing the auth heavy lifting and Convex enforcing product authorization.
```

The best experience is not one giant abstraction. It is a set of hard, proven paths:

- pick the template
- add only needed capabilities
- keep one source of truth
- let Better Auth own tenants and auth
- let Convex own product state and backend enforcement
- verify the stack locally

That is the simplest system we can stand behind for many kinds of SaaS, team, platform, and internal apps.
