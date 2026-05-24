# Trellis vNext Roadmap

Status: Draft
Date: 2026-05-24
Owner: Matthias

Related:

- `meta/ARCHITECTURE.md`
- `meta/ABSTRACTIONS.md`
- `meta/rfc-auth-foundation-refactor.md`
- `meta/rfc-auth-provider-runtime.md`
- `meta/adr/0014-component-bridges-for-packaged-integrations.md`

## Executive Decision

vNext should not be a broad rewrite.

The research pass showed that Trellis already has the correct architecture spine:

- app-owned feature folders;
- protected backend decision pipeline;
- server Convex helpers;
- trusted identity forwarding;
- operation-backed destructive work;
- MCP as an app projection;
- component bridges for packaged integrations;
- doctor, explain, inventory, and devtools foundations.

The right vNext is therefore:

1. Hard-cut the auth foundation while Trellis is still unreleased.
2. Tighten the inspector surface around operations, MCP, forwarding, and app inventory.
3. Improve starter guidance and local dev ergonomics without adding a second config system.
4. Keep Ginko CMS product policy in Ginko, and keep only repeated bridge mechanics in Trellis.
5. Defer Clerk, WorkOS, generic provider adapters, package-author templates, generic contracts, and generic migrations until experiments or a second consumer proves they are needed.

The short version:

```text
Fix the foundation now.
Do not add imaginary flexibility now.
Make the existing architecture harder to misuse.
```

## Double Check Summary

This roadmap was checked against the current Trellis and Ginko codebase before writing.

### Current Trellis Evidence

- Trellis architecture already says Convex owns app data and business rules, while Nuxt and MCP project that model into other surfaces: `meta/ARCHITECTURE.md`.
- The canonical protected decision path is already `principal -> actor -> guard -> load -> authorize -> handler`.
- Server helpers already support explicit auth modes: `auth: 'auto' | 'required' | 'none' | 'trusted'` in `src/runtime/convex/server/convex.ts`.
- Trusted server calls already use identity forwarding envelopes instead of public args as identity.
- `defineOperation(...)`, `previewOf(...)`, operation metadata, and destructive operation support already exist in `src/runtime/functions`.
- MCP already rejects unsafe direct mutation/action tools unless they are bounded writes or operation-backed in `src/runtime/mcp/define-mcp-app.ts`.
- `doctor` and inventory checks already exist in `src/cli/commands/doctor.ts` and `src/cli/lib/inventory-findings.ts`.
- `explain operation <id>` exists, but it cannot yet derive the exact MCP tool bound to an operation.
- Component bridge architecture is already accepted in `meta/adr/0014-component-bridges-for-packaged-integrations.md`.
- `@lupinum/trellis-bridge` is intentionally separate from the core Trellis package.

### Current Ginko CMS Evidence

Ginko CMS already uses Trellis correctly as a substrate:

- Ginko owns the user-facing install story.
- Ginko publishes a bridge manifest with generated files and managed edits.
- Ginko owns CMS collection contracts, content migrations, public projections, MCP capability mapping, and CLI commands.
- Trellis owns the generic bridge manifest/render/check mechanics and identity-forwarded component wrapper runtime.

Do not move Ginko product policy into Trellis.

### Template Evidence

The checked SvelteKit/Clerk template has useful concepts:

- explicit browser-authenticated vs backend-private call surfaces;
- a provider wrapper for Clerk state and token retrieval;
- a server service layer with tagged errors and trace ids;
- a working reference page;
- an `AGENTS.md` project policy.

Trellis should borrow the clarity, not the stack:

- do not copy the template's private API key passed through public Convex args;
- do not disable SSR as an auth strategy;
- do not add Effect as a Trellis server dependency;
- do not treat Clerk `user.id` as app identity.

## Junior Glossary

### Auth Identity

The identity Convex verified from an auth token.

For vNext, Trellis should read this through:

```ts
const identity = await ctx.auth.getUserIdentity()
```

The important field is:

```ts
identity.tokenIdentifier
```

That becomes `authKey`.

### Auth Key

`authKey` is the external auth lookup key.

It connects the signed-in provider identity to the local app user row:

```text
ctx.auth.getUserIdentity().tokenIdentifier -> users.authKey -> users._id
```

It is not an app user id. Do not store it in domain rows.

### App User

The row in the app-owned `users` table.

The canonical app user id is:

```ts
user._id
```

Domain rows should reference that id.

### App Identity

The app-shaped actor passed into protected handlers.

It should contain the local app user id and app-owned fields:

```ts
type AppIdentity = {
  kind: 'user'
  userId: Id<'users'>
  authKey: string
  role: string
  workspaceId?: Id<'workspaces'>
}
```

### Operation

An operation is a reusable business action.

Use it when one action must stay consistent across UI, server, MCP, preview, confirmation, and tests.

Example:

```ts
export const deleteProject = defineOperation({
  id: 'projects.delete',
  name: 'Delete project',
  kind: 'destructive',
  args: { projectId: v.id('projects') },
  permission: projectPermissions.delete,

  preview: async (ctx, args) => {
    return operationPreview({
      summary: 'Delete project',
      effects: [operationEffect('delete', 'projects', args.projectId)],
      confirm: { projectId: args.projectId },
    })
  },

  handler: async (ctx, args) => {
    await deleteProjectNow(ctx, args.projectId)
  },
})
```

### MCP Projection

MCP exposes app work to agents.

It must reuse the same app identity, permissions, tenant checks, and operation safety as the UI.

### Component Bridge

A component bridge is for packaged integrations.

It gives package consumers stable host files while the package keeps internal component refs private.

Normal app-local code should not use component bridges.

## vNext Scope

### In Scope Now

- Auth foundation hard cutover.
- Public naming cleanup around Better Auth-specific APIs.
- Provider-neutral `useConvexAuth()` state.
- `authKey` and local `users._id` as the app identity foundation.
- Domain references updated to local user ids.
- Better `doctor` and `explain` around operations, MCP, forwarding, and inventory.
- Starter `AGENTS.md` project policy files.
- Starter/local-dev improvements that reuse the existing harness pattern.
- Documentation updates that teach the existing architecture directly.

### Explicitly Out Of Scope Now

- Clerk provider implementation.
- WorkOS provider implementation.
- `auth.provider = 'clerk' | 'workos'` public config.
- Generic provider adapter registry.
- Optional Clerk or WorkOS dependencies in Trellis.
- Supporting multiple auth providers in one deployed app.
- Account linking.
- Provider-owned organization authority.
- Webhook sync framework.
- Generic `trellis.config.ts` app manifest.
- Generic `trellis.env.ts` env manifest.
- Generic contract framework.
- Generic migration framework.
- Generic package-author starter.
- Generic bridge CLI beyond the current `@lupinum/trellis-bridge` mechanics.
- Effect-based server runtime.

## Roadmap Phases

### Phase 0: Baseline Inventory

Purpose: prove the current state before changing anything.

Run:

```bash
rg -n "authId|by_auth_id|defineAuth|useConvexSignIn|useConvexSignUp|useConvexPasswordReset|ConvexUser|useConvexAuth\\(\\).*client" src examples apps tests meta -g '!**/_generated/**'
rg -n "tool\\.operation|defineOperation|serverConvex|auth: 'trusted'|createComponentBridge|identityForwarding" src examples apps tests packages meta -g '!**/_generated/**'
```

Expected finding:

- `authId`, `by_auth_id`, `defineAuth`, `ConvexUser`, and `useConvexSignIn` still exist today.
- `defineOperation`, MCP operation safety, trusted forwarding, and component bridge mechanics already exist and should be kept.

Acceptance criteria:

- The starting inventory is captured in the implementation issue or PR description.
- No implementation begins before the auth rename/cutover list is known.

### Phase 1: Auth Foundation Hard Cutover

This is the most important vNext work.

#### Decision

Use this identity model:

```text
provider JWT
  -> Convex UserIdentity
  -> identity.tokenIdentifier
  -> users.authKey
  -> users._id
  -> appIdentity.userId
  -> domain foreign keys
```

Do not keep `authId` and `authKey` side by side.

Trellis is unreleased, so the correct migration is a hard cutover.

#### Target User Schema

Use this in starters, examples, tests, and docs:

```ts
import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const userTables = {
  users: defineTable({
    authKey: v.string(),
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    role: v.union(v.literal('owner'), v.literal('admin'), v.literal('member'), v.literal('viewer')),
    workspaceId: v.optional(v.id('workspaces')),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_auth_key', ['authKey'])
    .index('by_workspace', ['workspaceId']),
}
```

Do not add `provider`, `providerSubject`, or `issuer` yet.

Reason:

- Better Auth is still the only supported provider today.
- Those fields become useful when Clerk or WorkOS exists.
- Adding them now creates schema that is not yet used by a real provider.

#### Target Auth Identity Helper

Use a small normalized helper:

```ts
export type AuthIdentity = {
  authKey: string
  providerSubject: string
  email?: string
  displayName?: string
  avatarUrl?: string
}

export async function getAuthIdentity(ctx: {
  auth: { getUserIdentity: () => Promise<any> }
}): Promise<AuthIdentity | null> {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return null

  return {
    authKey: identity.tokenIdentifier,
    providerSubject: identity.subject,
    ...(typeof identity.email === 'string' ? { email: identity.email } : {}),
    ...(typeof identity.name === 'string' ? { displayName: identity.name } : {}),
    ...(typeof identity.picture === 'string' ? { avatarUrl: identity.picture } : {}),
  }
}
```

Rule:

```ts
// Good
const user = await ctx.db
  .query('users')
  .withIndex('by_auth_key', (q) => q.eq('authKey', identity.tokenIdentifier))
  .first()

// Bad
const user = await ctx.db
  .query('users')
  .withIndex('by_auth_id', (q) => q.eq('authId', identity.subject))
  .first()
```

#### Target User Bootstrap

The app user row should be created from Convex identity, not from Better Auth component triggers.

```ts
function userProfilePatchFromIdentity(
  identity: AuthIdentity,
  now: number,
): Record<string, unknown> {
  const patch: Record<string, unknown> = { updatedAt: now }

  if (identity.email !== undefined) {
    patch.email = identity.email
  }
  if (identity.displayName !== undefined) {
    patch.displayName = identity.displayName
  }
  if (identity.avatarUrl !== undefined) {
    patch.avatarUrl = identity.avatarUrl
  }

  return patch
}

export const createUserIfNeeded = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await getAuthIdentity(ctx)
    if (!identity) {
      throw new Error('Not authenticated.')
    }

    const now = Date.now()
    const existing = await ctx.db
      .query('users')
      .withIndex('by_auth_key', (q) => q.eq('authKey', identity.authKey))
      .first()

    const patch = userProfilePatchFromIdentity(identity, now)

    if (existing) {
      await ctx.db.patch(existing._id, patch)
      return existing._id
    }

    return await ctx.db.insert('users', {
      authKey: identity.authKey,
      ...patch,
      role: 'member',
      createdAt: now,
    })
  },
})
```

Rules:

- Better Auth triggers may update auth-side data if needed.
- Better Auth triggers must not be the canonical source for app `users` rows.
- Better Auth deletion must not hard-delete app data automatically.

#### Target App Identity

`appIdentity.userId` must become local `users._id`.

```ts
export type AppIdentity = {
  kind: 'user'
  userId: Id<'users'>
  authKey: string
  role: string
  workspaceId?: Id<'workspaces'>
}

export async function getAppIdentity(ctx: Ctx): Promise<AppIdentity | null> {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return null

  const user = await ctx.db
    .query('users')
    .withIndex('by_auth_key', (q) => q.eq('authKey', identity.tokenIdentifier))
    .first()

  if (!user) return null

  return {
    kind: 'user',
    userId: user._id,
    authKey: user.authKey,
    role: user.role,
    workspaceId: user.workspaceId,
  }
}
```

Rules:

- `userId` means local `users._id`.
- `authKey` means external auth lookup key.
- `providerSubject` means raw provider subject.
- Do not use `authKey` as a domain foreign key.

#### Target Domain References

Good:

```ts
tasks: defineTable({
  title: v.string(),
  createdByUserId: v.id('users'),
  assigneeUserId: v.optional(v.id('users')),
})

memberships: defineTable({
  userId: v.id('users'),
  workspaceId: v.id('workspaces'),
  role: v.union(v.literal('admin'), v.literal('member')),
})
  .index('by_user', ['userId'])
  .index('by_workspace', ['workspaceId'])
  .index('by_workspace_user', ['workspaceId', 'userId'])
```

Bad:

```ts
tasks: defineTable({
  // Bad: this stores an external auth key or provider subject.
  createdBy: v.string(),
})
```

#### Better Auth Naming

Current public names are too generic.

Hard cut:

| Current                  | Target                       |
| ------------------------ | ---------------------------- |
| `defineAuth`             | `defineBetterAuth`           |
| `DefineAuthOptions`      | `DefineBetterAuthOptions`    |
| `DefineAuthDeps`         | `DefineBetterAuthDeps`       |
| `ConvexAuthBridge`       | `BetterAuthBridge`           |
| `useConvexSignIn`        | `useBetterAuthSignIn`        |
| `useConvexSignUp`        | `useBetterAuthSignUp`        |
| `useConvexPasswordReset` | `useBetterAuthPasswordReset` |
| `useConvexAuthActions`   | `useBetterAuthActions`       |

Do not keep aliases.

Example:

```ts
// convex/auth.ts
import { defineBetterAuth } from '@lupinum/trellis/auth'
import { components, internal } from './_generated/api.js'
import { mutation } from './_generated/server.js'
import authConfig from './auth.config.js'

const auth = defineBetterAuth(
  { components, internal, mutation, authConfig },
  { emailPassword: true },
)

export const authComponent = auth.authComponent
export const createAuth = auth.createAuth
export const createUserIfNeeded = auth.createUserIfNeeded
```

#### Provider-Neutral Auth Composable

`useConvexAuth()` should not expose a Better Auth client.

Target:

```ts
const auth = useConvexAuth()

auth.sessionUser.value
auth.isAuthenticated.value
auth.isPending.value
auth.isAnonymous.value
auth.isSessionExpired.value
await auth.refreshAuth()
await auth.signOut()
```

Target type:

```ts
export type AuthSessionUser = {
  email?: string
  displayName?: string
  avatarUrl?: string
  emailVerified?: boolean
}

export interface UseConvexAuthReturn {
  sessionUser: Readonly<Ref<AuthSessionUser | null>>
  isAuthenticated: ComputedRef<boolean>
  isPending: Readonly<Ref<boolean>>
  isAnonymous: ComputedRef<boolean>
  isSessionExpired: ComputedRef<boolean>
  refreshAuth: () => Promise<void>
  authError: Readonly<Ref<Error | null>>
  signOut: () => Promise<void>
}
```

Better Auth direct access moves to Better Auth-named APIs:

```ts
const betterAuthClient = useBetterAuthClient()
const { signIn } = useBetterAuthSignIn()
```

Do not expose `sessionUser.id`.

Reason:

- A session profile is not the app user row.
- UI code should not accidentally pass a provider subject to Convex as a local user id.

#### Auth Foundation Acceptance Criteria

This phase is done when:

- No maintained starter/example schema uses `authId`.
- No maintained starter/example schema uses `by_auth_id`.
- `users.authKey` is created from `identity.tokenIdentifier`.
- App user bootstrap no longer relies on raw Better Auth component user ids.
- `defineAppIdentity.fromAuth()` resolves by `authKey`.
- `appIdentity.userId` is local `users._id`.
- Domain rows use local user ids.
- Trusted forwarded user subjects refer to local `users._id`.
- `useConvexAuth()` exposes `sessionUser`, not `user`.
- `AuthSessionUser` replaces `ConvexUser`.
- Public auth session user shape has no `id`.
- Better Auth-specific composables say `BetterAuth`.
- `defineAuth` is gone.
- No Clerk or WorkOS dependencies/config are added.

#### Auth Foundation Tests

Add or update tests for these invariants.

```ts
it('uses tokenIdentifier as authKey', async () => {
  const identity = {
    subject: 'same-subject',
    tokenIdentifier: 'https://issuer.example|same-subject',
    email: 'a@example.test',
    name: 'Alice',
  }

  const userId = await createUserIfNeeded(ctx.withIdentity(identity))
  const user = await ctx.db.get(userId)

  expect(user.authKey).toBe(identity.tokenIdentifier)
})
```

```ts
it('allows the same provider subject from two issuers', async () => {
  const first = await createUserIfNeeded(
    ctx.withIdentity({
      subject: 'user_same',
      tokenIdentifier: 'https://issuer-one.example|user_same',
    }),
  )

  const second = await createUserIfNeeded(
    ctx.withIdentity({
      subject: 'user_same',
      tokenIdentifier: 'https://issuer-two.example|user_same',
    }),
  )

  expect(first).not.toBe(second)
})
```

```ts
it('returns local users._id as appIdentity.userId', async () => {
  const userId = await ctx.db.insert('users', {
    authKey: 'issuer|subject',
    role: 'member',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })

  const resolved = await appIdentity.resolve(
    ctx.withIdentity({ subject: 'subject', tokenIdentifier: 'issuer|subject' }),
  )

  expect(resolved?.appIdentity.userId).toBe(userId)
  expect(resolved?.appIdentity.authKey).toBe('issuer|subject')
})
```

```ts
it('keeps useConvexAuth provider-neutral', () => {
  const auth = useConvexAuth()

  expect('client' in auth).toBe(false)
  expect('user' in auth).toBe(false)
  expect('sessionUser' in auth).toBe(true)
  expect('id' in (auth.sessionUser.value ?? {})).toBe(false)
})
```

### Phase 2: Inspector Hardening

Purpose: make the existing architecture easier to verify.

Do not add a new architecture layer called "call lanes".

Instead, teach the lanes that already exist:

| Lane name in docs       | Current Trellis mechanism                                         |
| ----------------------- | ----------------------------------------------------------------- |
| anonymous browser read  | public Convex handler                                             |
| signed-in browser call  | protected handler and app identity                                |
| Nuxt server call        | `serverConvexQuery`, `serverConvexMutation`, `serverConvexAction` |
| trusted server call     | `serverConvex*` with `auth: 'trusted'`                            |
| internal Convex call    | Convex internal functions                                         |
| packaged component call | `@lupinum/trellis-bridge` component bridge                        |
| agent call              | `defineMcpApp(...).tool.*`                                        |

#### Work Item 2.1: Exact Operation To MCP Tool Binding

Current gap:

`trellis explain operation <id>` can identify operation-backed MCP tools, but not the exact operation id each tool binds to.

Target:

```bash
trellis explain operation projects.delete
```

Expected output should say:

```text
operation: projects.delete
kind: destructive
execute projection: convex/features/projects/operations.ts
preview projection: convex/features/projects/operations.ts
mcp tools:
  delete-project
    source: server/mcp/tools/delete-project.ts
    status: operation-backed
```

Acceptance criteria:

- Public-surface inventory records operation id for `tool.operation(...)`.
- `explain operation <id>` lists exact MCP tool names and source files.
- Doctor can warn when a destructive operation is exposed to MCP without the expected preview projection.

#### Work Item 2.2: MCP Safety Findings

Keep the current rule:

```text
Destructive MCP tools must use tool.operation(...).
Direct MCP mutation/action tools must be bounded writes.
```

Improve `doctor` output so junior developers understand the fix.

Bad:

```ts
tool.mutation('delete-project', {
  ref: api.projects.deleteProject,
})
```

Good:

```ts
tool.operation(deleteProject, {
  execute: api.projects.executeDeleteProject,
  preview: api.projects.previewDeleteProject,
  scopeKey: ({ access }) => access.workspaceId,
})
```

Acceptance criteria:

- `doctor` fails destructive-looking MCP tools not using `tool.operation(...)`.
- `doctor` fails direct writes without bounded-write safety.
- Error messages explain whether to use `tool.mutation(...)` or `tool.operation(...)`.

#### Work Item 2.3: Trusted Forwarding Findings

Keep this rule:

```text
Forwarded identity is allowed only on auth: 'trusted' server calls.
```

Bad:

```ts
await serverConvexMutation(event, api.tasks.create, {
  title: 'Import',
  caller,
})
```

Good:

```ts
await serverConvexMutation(
  event,
  api.tasks.createFromTrustedSource,
  { title: 'Import' },
  { auth: 'trusted', caller },
)
```

Acceptance criteria:

- `doctor` detects obvious `caller` forwarding outside trusted calls.
- `doctor` detects public exposure of `CONVEX_IDENTITY_FORWARDING_KEY`.
- Docs teach `auth: 'trusted'` as a trust boundary, not as a convenience flag.

### Phase 3: Starter Guidance And Local Dev

Purpose: reduce setup confusion without adding a new Trellis config source.

#### Work Item 3.1: Starter `AGENTS.md`

Add a small static `AGENTS.md` to generated starters.

Do not generate a dynamic file from installed modules yet.

Suggested starter policy:

````md
# Project Policy

Use pnpm.

After changing Convex files, run:

```bash
pnpm convex:codegen
pnpm typecheck
```

Auth:

- use Better Auth-specific helpers for sign-in/sign-up;
- use `useConvexAuth()` only for provider-neutral auth state;
- do not use session user ids as app user ids.

Convex:

- keep business rules in Convex handlers;
- use protected handlers for signed-in app work;
- use local `users._id` for domain user references.

Server:

- use `serverConvexQuery`, `serverConvexMutation`, and `serverConvexAction`;
- use `auth: 'trusted'` only after the server route verified the request.

MCP:

- use `tool.query(...)` for reads;
- use `tool.mutation(...)` only for bounded writes;
- use `tool.operation(...)` for destructive or sensitive actions.
````

Acceptance criteria:

- Starters include a short `AGENTS.md`.
- The file contains no stack-specific instructions for unsupported providers.
- The file does not claim generated module-specific policy that Trellis cannot check.

#### Work Item 3.2: One-Command Local Convex Dev For Starters

The internal harness already proves a local Convex dev pattern.

Target:

- keep current `convex:dev` and `convex:codegen` scripts;
- add a starter-friendly `dev:local` only if it uses the existing Nuxt/Vite local Convex pattern cleanly;
- do not add a new `trellis dev` CLI yet.

Acceptance criteria:

- A new starter can run local Convex without manually editing public Convex URLs.
- Local secrets remain local and server-only.
- Hosted Convex dev still works.

#### Work Item 3.3: Compact Patterns Reference

Add one maintained docs/example page that shows the normal patterns together:

- public query;
- protected query;
- protected mutation;
- server-side Convex call;
- trusted forwarding call;
- permission check;
- destructive operation preview/execute;
- MCP operation binding;
- normalized error example.

Do not add this page to every generated app yet.

Acceptance criteria:

- The page is maintained as part of docs or examples.
- The page uses Better Auth names from Phase 1.
- The page does not teach Clerk or WorkOS before those providers exist.

### Phase 4: Bridge Polish, Not Bridge Expansion

Purpose: keep packaged integrations clean without moving Ginko policy into Trellis.

#### Current Decision

`@lupinum/trellis-bridge` remains the generic packaged-integration substrate.

Ginko CMS keeps owning:

- CMS collection contracts;
- content import;
- content migrations;
- public content projections;
- CMS MCP tools and capability mapping;
- Ginko CLI and install docs;
- Ginko-specific Better Auth/component registration checks.

Trellis keeps owning:

- bridge manifest shape;
- generated bridge file rendering;
- bridge drift checks;
- identity-forwarded component wrappers.

#### Work Item 4.1: Bridge API Documentation

Document bridge as:

```text
Use component bridges only for packaged integrations that need stable host refs.
Normal app features should call root Convex handlers directly.
```

Acceptance criteria:

- Docs match `meta/adr/0014-component-bridges-for-packaged-integrations.md`.
- Docs do not tell normal app authors to create bridges.
- Docs point product package authors to `@lupinum/trellis-bridge`.

#### Work Item 4.2: Bridge Tests

Only add bridge tests that protect generic Trellis mechanics.

Good generic tests:

- manifest render is deterministic;
- generated file headers include package/version metadata;
- bridge drift check detects stale generated files;
- forwarding envelope refuses missing/weak keys in production;
- component bridge wrappers stay thin.

Do not add CMS collection tests to Trellis.

### Phase 5: Documentation And Naming Cleanup

Purpose: make the public story match the implementation.

Update docs to say:

- Better Auth is the current supported auth provider.
- Trellis after Convex auth is provider-neutral.
- `authKey` maps auth identity to app user.
- `users._id` is the app user id.
- `sessionUser` is a session profile and has no id.
- `defineBetterAuth` configures Better Auth.
- Better Auth email/password flows use Better Auth-named composables.
- MCP destructive tools use operation-backed preview/execute.
- Trusted forwarding is an explicit server boundary.
- Component bridges are for packaged integrations.

Docs must stop saying:

- `users.authId`;
- `by_auth_id`;
- `useConvexAuth().client`;
- `useConvexAuth().user`;
- `ConvexUser.id`;
- `defineAuth`;
- `useConvexSignIn`;
- `useConvexSignUp`;
- `useConvexPasswordReset`;
- `appIdentity.userId` is a provider subject.

Acceptance criteria:

```bash
rg -n "authId|by_auth_id|defineAuth|useConvexSignIn|useConvexSignUp|useConvexPasswordReset|ConvexUser|useConvexAuth\\(\\).*client" apps/docs examples src/cli/starter-fixtures meta/skill -g '!**/_generated/**'
```

Expected result:

- no maintained public docs or starter references, except historical RFC text if intentionally kept.

## Deferred Work

### Defer: Clerk And WorkOS

Do not implement provider support in this vNext.

Before implementation, run experiments from `meta/rfc-auth-provider-runtime.md`.

Minimum future experiments:

- prove Clerk Nuxt token retrieval for Convex, including whether `getToken()` needs a named template;
- prove Clerk SSR token retrieval;
- prove Clerk sign-out refreshes Convex auth state;
- prove WorkOS AuthKit sealed session login/callback/token/refresh/logout;
- prove WorkOS JWT `iss`, JWKS, and custom domain behavior;
- prove WorkOS organization switching changes the token claims Trellis needs;
- prove Convex `ctx.auth.getUserIdentity().tokenIdentifier` is stable enough for `authKey`;
- prove server helpers can resolve provider tokens without Better Auth routes.

Provider support may start only after the experiments show the token path works.

### Defer: Generic App Manifest

Do not add `trellis.config.ts` now.

Concern:

- Nuxt config, Convex config, package exports, feature manifests, and generated inventory already exist.
- A new app manifest could become a second source of truth.

Simpler alternative:

- keep `defineFeature(...)`, `composeFeatures(...)`, static app inventory, package exports, and `doctor` inventory;
- add a manifest only when a concrete check cannot be expressed from existing sources.

### Defer: Typed Env Manifest

Do not add `trellis.env.ts` now.

Useful idea:

- secret placement checks are valuable.

Risk:

- a new env manifest duplicates Nuxt runtime config, Convex env, deployment env, and package docs.

Simpler vNext:

- improve `doctor` checks for known Trellis secrets;
- document public/server/Convex env placement;
- add a manifest later only if doctor cannot reliably explain env placement.

### Defer: Generic Contracts And Migrations

Do not move Ginko contracts or migrations into Trellis now.

Concern:

- Ginko's collection contracts, content snapshots, draft migration semantics, asset rebuilds, and public content projections are CMS policy.

Simpler alternative:

- keep Ginko-specific contracts/migrations in Ginko;
- extract a generic Trellis contract/migration primitive only after a second package needs the same pattern.

### Defer: Generic Package-Author Starter

Do not add a package-author starter yet.

Reason:

- `@lupinum/trellis-bridge` and Ginko should prove the package integration model first.

Acceptance criterion for later:

- a second packaged integration needs generated host bridge files, managed edits, and package-owned install checks.

### Defer: DevTools Expansion

DevTools is useful, but it should not lead the foundation work.

Add panels later after runtime events and inventory are stable:

- operations;
- MCP tools;
- bridge drift;
- auth token/session state;
- trusted forwarding events.

## Explicit Do-Not-Do List

Do not:

- keep old and new auth paths side by side;
- expose `defineAuth` as an alias after `defineBetterAuth`;
- keep `useConvexSignIn` aliases;
- store auth keys in domain rows;
- store provider subjects in `userId`;
- pass private bridge keys as public Convex args;
- use Better Auth as a wrapper to claim first-class Clerk/WorkOS support;
- add Clerk/WorkOS dependencies before experiments;
- add Effect as a server runtime;
- copy Ginko CMS product policy into Trellis;
- make DevTools a second source of truth;
- add `trellis.config.ts` just because it is neat;
- add generic migrations/contracts before repeated need exists.

## Final vNext Sequence

Recommended implementation order:

1. Inventory current auth and public API coupling.
2. Rename Better Auth-specific public APIs.
3. Rename `ConvexUser` to `AuthSessionUser` and `user` to `sessionUser`.
4. Remove Better Auth client from `useConvexAuth()`.
5. Change user schema from `authId` to `authKey`.
6. Bootstrap users from `identity.tokenIdentifier`.
7. Change app identity to use local `users._id`.
8. Update domain tables and examples to store local user ids.
9. Update trusted forwarding user semantics to local user ids.
10. Update tests and fixtures.
11. Update docs, starter READMEs, and skill references.
12. Add starter `AGENTS.md`.
13. Improve `doctor` and `explain` inventory for operation/MCP bindings.
14. Add or polish local Convex starter dev loop if it can reuse the harness pattern directly.
15. Run focused verification, then full release verification.

## Verification Commands

Run during implementation:

```bash
pnpm run format:check
pnpm run lint
pnpm run test:internals
pnpm run test:contracts
pnpm run test:types
pnpm run test:examples
```

Run before calling vNext done:

```bash
pnpm run release:verify
```

Run final concept checks:

```bash
rg -n "authId|by_auth_id|defineAuth|useConvexSignIn|useConvexSignUp|useConvexPasswordReset|ConvexUser|useConvexAuth\\(\\).*client" src examples apps tests apps/docs meta/skill -g '!**/_generated/**'
rg -n "provider: 'clerk'|provider: 'workos'|@clerk/nuxt|@workos-inc/node" src examples apps tests apps/docs meta/skill -g '!**/_generated/**'
```

Expected:

- old auth names are gone from maintained public/runtime surfaces;
- Clerk/WorkOS code is absent except in RFC/research docs;
- existing Better Auth behavior still works through Better Auth-named APIs.

## vNext Done Criteria

vNext is done when:

- auth foundation uses `authKey`;
- app identity uses local `users._id`;
- domain rows reference local user ids;
- `useConvexAuth()` is provider-neutral;
- Better Auth public APIs are explicitly named Better Auth;
- destructive MCP safety remains operation-backed;
- `doctor` and `explain` can show operation/MCP safety clearly;
- starters include clear project policy;
- docs no longer teach old names;
- no unsupported provider abstraction was added;
- Ginko CMS still owns CMS product policy;
- Trellis bridge remains the generic packaged-integration substrate;
- release verification passes.
