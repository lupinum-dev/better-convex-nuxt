# RFC: Resource Declaration and MCP Projection

Status: Proposed
Date: 2026-04-20
Audience: Trellis maintainers and app authors

## Summary

Trellis should **not** replace its current raw primitives with a large DSL.

Trellis **should** first improve the current raw model with:

- stronger metadata on protected handlers
- validation for MCP tool bindings
- better scaffolding and inspect/debug output

After that work lands, Trellis may add a **small, optional** resource DSL on top:

- `resource(...)`
- `exposeMcp(...)`

That DSL must stay narrow, must expand to the existing raw primitives, and must ship with an inspect/generated expansion story from day one.

Short version:

- `Now`: raw-first, but safer
- `Later`: optional narrow DSL
- `Never`: mega `defineApp(...)`, YAML, or transport-wide magic

## Why This RFC Exists

Today, Trellis is very explicit.

That explicitness is good because:

- it is easy to see what runs where
- it is easy to debug one layer at a time
- the trust model is visible
- the permission model is visible

But the current shape also creates real maintenance cost.

The strongest example is MCP projection. A protected backend action can be split across:

- a permission definition
- a guard or record-level check
- a protected handler
- an MCP capability snapshot
- an MCP tool file

That creates drift risk.

Example from the repo:

- [update-runbook.ts](/Users/matthias/Git/0_libs/WORK/trellis/examples/07-mcp-reference/server/mcp/tools/workspace/update-runbook.ts:1)
- [create-runbook.ts](/Users/matthias/Git/0_libs/WORK/trellis/examples/07-mcp-reference/server/mcp/tools/workspace/create-runbook.ts:1)

The `update-runbook` tool currently declares `runbookCreate` as its permission. That is exactly the class of bug this RFC is about.

This RFC answers one question:

Should Trellis solve this with a DSL, or should it stay raw?

## Junior-Friendly Mental Model

If you are new to Trellis, think about the system in three layers.

### Layer 1: Raw primitives

These are the building blocks:

- `definePermission(...)`
- `defineGuard(...)`
- `defineOperation(...)`
- `mutation(...)`
- `query(...)`
- `tool(...)`
- `tool.fromOperation(...)`

These are the "real machine parts".

### Layer 2: Small declaration layer

This is the possible future convenience layer:

- `resource(...)`
- `exposeMcp(...)`

This layer should only reduce repetition. It should not invent a second runtime model.

### Layer 3: Raw transport edges

These stay explicit:

- webhooks
- custom HTTP routes
- cron jobs
- one-off scripts

These are too transport-specific to be safely hidden behind projections.

## Current State

Trellis already has a strong raw model.

Important repo evidence:

- The canonical app shape is explicitly documented in [Canonical app layout](/Users/matthias/Git/0_libs/WORK/trellis/apps/docs/content/docs/01.getting-started/5.canonical-app-layout.md:1).
- Operations already solve one important reuse problem in [Operations](/Users/matthias/Git/0_libs/WORK/trellis/apps/docs/content/docs/08.permissions/7.operations.md:1).
- Destructive MCP tools are already strongly bound through operation metadata in [operation-binding.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/mcp/operation-binding.ts:1).
- The CLI already scaffolds repeated resource shapes in [src/cli/lib/resource.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/cli/lib/resource.ts:146).

So this is not a repo with no abstractions. It already has:

- explicit raw primitives
- conventions
- code generation
- operation projection

That matters, because a DSL would be added on top of an existing architecture, not into an empty space.

## The Core Problem

The problem is **not** that Trellis is verbose.

The real problem is this:

> Some repeated declarations live in multiple files and can silently drift apart.

The highest-risk area is regular MCP tool projection.

Destructive tools are already safer because `tool.fromOperation(...)` validates execute/preview binding.

Regular tools are less safe because a file can say:

```ts
export default tool({
  schema: updateRunbook,
  call: api.domain.runbooks.update,
  permission: runbookCreate,
})
```

And today that can survive if tests do not catch it.

## Goals

- Reduce drift between protected backend handlers and MCP projection
- Keep the trust model explicit
- Keep the principal/actor split explicit
- Keep record-level authorization explicit
- Make common resource work easier to read and maintain
- Preserve a clean escape hatch to raw primitives

## Non-Goals

- Replace Trellis raw primitives
- Hide webhooks or HTTP routes behind projections
- Introduce a YAML or custom parser based language
- Add a mega app-level configuration API
- Remove the canonical Trellis lane structure

## Options Considered

## Option A: Stay Raw, No New Work

Description:

- keep the current APIs
- keep the current file layout
- rely on docs, reviews, and tests

### Pros

- zero new abstraction burden
- current code stays maximally explicit
- no DSL maintenance burden

### Cons

- drift bugs remain easy to write
- repeated MCP tool wiring remains manual
- adding a resource still requires a lot of jumping between files
- new users must reconstruct one feature from many locations

### Verdict

Too passive. This does not solve the known problem.

## Option B: Build the Full DSL Now

Description:

- make `resource(...)` the new mainline authoring style now
- make `exposeMcp(...)` the default path for MCP

### Pros

- better co-location
- fewer repeated declarations
- easier feature-oriented reading

### Cons

- commits Trellis to a second authoring model too early
- creates ongoing design burden
- risks hiding too much from users
- likely to be rebuilt once more real apps expose gaps
- weakens the current explicit learning path if shipped too soon

### Verdict

Too early.

The design direction is promising, but the repo does not yet show enough evidence to justify making it the default authoring model.

## Option C: Improve Raw First, Add a Small Optional DSL Later

Description:

Phase 1:

- keep the current raw APIs
- add metadata and validation so drift is harder
- improve generators and inspect/debug tools

Phase 2:

- add an optional narrow DSL for resource declaration and MCP projection
- keep raw as the permanent substrate

### Pros

- solves the most urgent problem first
- keeps Trellis easy to debug
- preserves existing docs and mental model
- lets the DSL prove itself before becoming a major surface

### Cons

- some repetition remains for a while
- the team has to support raw and optional DSL later
- improvement lands in two steps instead of one

### Verdict

Recommended.

## Recommendation

Trellis should adopt **Option C**.

That means:

### Phase 1: Do this now

1. Add metadata to protected handlers so Trellis knows their coarse permission gate.
2. Validate `tool({...})` bindings against that metadata at startup or build time.
3. Add `doctor` checks for MCP permission drift.
4. Improve scaffolding for repeated resource patterns.
5. Add an inspect/debug surface for tool projection.

### Phase 2: Maybe do this later

After more real apps exist, add:

- `resource(...)`
- `exposeMcp(...)`

These must be:

- optional
- narrow
- built on top of the raw APIs
- inspectable

## The Sweet Spot

The sweet spot is:

- **Declare with a small DSL**
- **Execute with raw handlers**

Said differently:

- policy shape can be declared
- projection shape can be declared
- business logic stays raw

This is the line Trellis should defend.

## Before and After

This section is intentionally concrete.

## Before: Current Raw MCP Tool

This is close to what Trellis has today.

```ts
// server/mcp/tools/workspace/update-runbook.ts
import { api } from '#trellis/api'
import { runbookCreate } from '~/convex/auth/permissions'
import { updateRunbook } from '~/shared/schemas/runbook'

import { tool } from '../../runtime'

export default tool({
  schema: updateRunbook,
  call: api.domain.runbooks.update,
  permission: runbookCreate,
  group: 'workspace',
  middleware: async (args, ctx, next) => {
    if (
      args.title === undefined &&
      args.summary === undefined &&
      args.content === undefined &&
      args.visibility === undefined &&
      args.tags === undefined
    ) {
      return ctx.error('validation', 'Provide at least one field to update.')
    }

    return await next()
  },
  meta: {
    name: 'update-runbook',
  },
})
```

Problem:

- `call` points at `runbooks.update`
- `permission` points at `runbookCreate`

Nothing in this file makes the mismatch obvious unless the reviewer catches it or tests fail.

## After, Phase 1: Better Raw

In the recommended near-term path, Trellis stays raw but carries metadata.

Example shape:

```ts
// convex/domain/runbooks.ts
export const update = mutation({
  args: updateRunbook.args,
  guard: runbookRead,
  metadata: {
    coarsePermission: runbookRead,
  },
  load: async (ctx, args) => {
    const runbook = await ctx.db.get(args.id)
    requireRecord(runbook, 'Runbook')
    return { runbook }
  },
  authorize: {
    check: (_actor, { runbook }) => canUpdateRunbook(runbook),
  },
  handler: async (ctx, args, { runbook }) => {
    const actor = await ctx.actor()
    const nextVisibility = args.visibility ?? runbook.visibility

    if (nextVisibility === 'public' && !can(actor, runbookPublish.check)) {
      throw deny('Only owners and admins can publish runbooks.')
    }

    await ctx.db.patch(args.id, {
      ...(args.title !== undefined ? { title: args.title } : {}),
      ...(args.summary !== undefined ? { summary: args.summary } : {}),
      ...(args.content !== undefined ? { content: args.content } : {}),
      ...(args.tags !== undefined ? { tags: args.tags } : {}),
      ...(args.visibility !== undefined ? { visibility: args.visibility } : {}),
      updatedAt: Date.now(),
    })
  },
})
```

Then the tool can be checked against the called handler:

```ts
// server/mcp/tools/workspace/update-runbook.ts
export default tool({
  schema: updateRunbook,
  call: api.domain.runbooks.update,
  permission: runbookRead,
  meta: {
    name: 'update-runbook',
  },
})
```

And Trellis can reject this bad binding:

```ts
export default tool({
  schema: updateRunbook,
  call: api.domain.runbooks.update,
  permission: runbookCreate, // invalid: does not match handler metadata
})
```

This is a good first step because:

- the code stays explicit
- the file layout stays stable
- the drift bug becomes much harder to write

## After, Phase 2: Optional Resource DSL

If Trellis later adds a small DSL, the normal case could look like this.

```ts
import { resource, allow, role, ownerOf } from '@lupinum/trellis/dsl'
import { createRunbook, updateRunbook, deleteRunbook } from '../../shared/schemas/runbook'

export const runbooks = resource('runbook', {
  tenant: { field: 'workspaceId', required: true },

  roles: ['owner', 'admin', 'member', 'viewer'] as const,

  permissions: {
    read: allow.roles('owner', 'admin', 'member', 'viewer'),
    create: allow.roles('owner', 'admin', 'member'),
    update: allow.when(role('owner', 'admin').or(role('member').and(ownerOf('ownerId')))),
    delete: allow.when(role('owner', 'admin').or(role('member').and(ownerOf('ownerId')))),
    publish: allow.roles('owner', 'admin').project(false),
  },

  mutations: {
    create: {
      schema: createRunbook,
      gate: 'create',
      handler: async ({ db, actor, can }, args) => {
        const visibility = args.visibility ?? 'draft'

        if (visibility === 'public' && !can('publish')) {
          throw new Error('Only owners and admins can create public runbooks.')
        }

        return await db.insert('runbooks', {
          ...args,
          visibility,
          ownerId: actor.userId,
          workspaceId: actor.tenantId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
      },
    },

    update: {
      schema: updateRunbook,
      gate: 'read',
      load: async ({ db }, args) => ({
        runbook: await db.getOrThrow(args.id, 'Runbook'),
      }),
      authorize: ({ loaded, canRecord }) => canRecord('update', loaded.runbook),
      handler: async ({ db, loaded, can }, args) => {
        const nextVisibility = args.visibility ?? loaded.runbook.visibility

        if (nextVisibility === 'public' && !can('publish')) {
          throw new Error('Only owners and admins can publish runbooks.')
        }

        await db.patch(args.id, {
          ...(args.title !== undefined ? { title: args.title } : {}),
          ...(args.summary !== undefined ? { summary: args.summary } : {}),
          ...(args.content !== undefined ? { content: args.content } : {}),
          ...(args.tags !== undefined ? { tags: args.tags } : {}),
          ...(args.visibility !== undefined ? { visibility: args.visibility } : {}),
          updatedAt: Date.now(),
        })
      },
    },
  },

  operations: {
    remove: {
      kind: 'destructive',
      schema: deleteRunbook,
      gate: 'read',
      load: async ({ db }, args) => ({
        runbook: await db.getOrThrow(args.id, 'Runbook'),
      }),
      authorize: ({ loaded, canRecord }) => canRecord('delete', loaded.runbook),
      preview: ({ loaded }) => ({
        display: {
          summary: `Will permanently delete "${loaded.runbook.title}".`,
          warn: 'This cannot be undone.',
          affects: { runbooks: 1 },
        },
        confirm: {
          operation: 'runbooks.remove',
          targetId: loaded.runbook._id,
          affectedCounts: { runbooks: 1 },
        },
      }),
      execute: async ({ db }, args) => {
        await db.delete(args.id)
        return null
      },
    },
  },
})
```

Then MCP can be projected instead of rewired:

```ts
import { exposeMcp } from '@lupinum/trellis/dsl/mcp'
import { runbooks } from '~/convex/resources/runbooks'

export const runbookTools = exposeMcp(runbooks, {
  include: ['mutations.create', 'mutations.update', 'operations.remove'],

  rename: {
    'mutations.create': 'create-runbook',
    'mutations.update': 'update-runbook',
    'operations.remove': 'delete-runbook',
  },

  overrides: {
    'mutations.create': {
      middleware: async (args, ctx, next) => {
        if (!args.content.trim().startsWith('# ')) {
          return ctx.error('validation', 'Runbook content must start with a markdown heading.')
        }
        return await next()
      },
    },
  },
})
```

This is attractive because:

- policy and projection live closer together
- the normal case is easier to scan
- regular MCP drift becomes harder

But this should still be optional.

## Why the Recommendation Is Phased

Because the repo teaches an important lesson:

- some abstraction is already worth it
- too much abstraction would blur Trellis' trust and execution model

The right move is not to decide "DSL good" or "DSL bad".

The right move is to decide:

1. what should be raw forever
2. what should gain metadata and validation now
3. what may later deserve a small declaration layer

## What Must Stay Raw

These should stay explicit:

- webhook verification routes
- custom HTTP handlers
- principal resolution
- transport-specific auth
- unusual multi-resource business flows

Reason:

These are the places where hidden expansion is most dangerous.

## What May Be Declared

These are the best candidates for a narrow DSL:

- static resource permissions
- resource-level query and mutation registration
- operation registration
- MCP projection from a resource

Reason:

These are repeated shapes with stable semantics.

## Required Rules If Trellis Adds the DSL Later

If `resource(...)` ships later, these rules should be mandatory:

1. Raw primitives remain public and supported.
2. DSL expansion must be inspectable.
3. `exposeMcp(...)` must support local overrides.
4. No `defineApp(...)`.
5. No webhook or HTTP route projection DSL.
6. The DSL must compile down to the same trust and permission model Trellis already uses.

## Debugging Requirement

If Trellis ships the optional DSL later, it must also ship at least one of:

- `resource.inspect()`
- generated files such as `runbooks.generated.ts`
- startup diagnostics showing expanded permissions and MCP bindings

If users cannot inspect expansion, the DSL will feel magical in a bad way.

## Open Questions

These are intentionally deferred until after Phase 1:

- What exact metadata shape should protected handlers expose?
- Should MCP permission mismatch fail at type-check time, startup, or both?
- Should `resource(...)` live in core or behind an experimental entrypoint?
- How much generated output is enough for inspectability?

## Final Decision

Trellis should:

- strengthen the current raw model now
- delay a DSL commitment until more real apps confirm the abstraction
- keep any future DSL narrow and optional

This gives Trellis the real benefit:

- less drift
- better guidance
- safer MCP projection

Without paying the full cost too early:

- second authoring model
- hidden runtime behavior
- oversized framework surface

That is the sweet spot.

## References

Repo references:

- [Canonical app layout](/Users/matthias/Git/0_libs/WORK/trellis/apps/docs/content/docs/01.getting-started/5.canonical-app-layout.md:1)
- [Operations](/Users/matthias/Git/0_libs/WORK/trellis/apps/docs/content/docs/08.permissions/7.operations.md:1)
- [Define tools](/Users/matthias/Git/0_libs/WORK/trellis/apps/docs/content/docs/14.mcp-tools/2.define-tools.md:1)
- [Destructive tools](/Users/matthias/Git/0_libs/WORK/trellis/apps/docs/content/docs/14.mcp-tools/4.destructive-tools.md:1)
- [Resource generator templates](/Users/matthias/Git/0_libs/WORK/trellis/src/cli/lib/resource.ts:146)
- [Operation binding checks](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/mcp/operation-binding.ts:1)

External references:

- [Martin Fowler: Domain Specific Languages](https://martinfowler.com/books/dsl.html)
- [Rails Routing Guide](https://guides.rubyonrails.org/v8.0.0/routing.html)
- [Prisma Data Modeling](https://docs.prisma.io/docs/v6/orm/overview/introduction/data-modeling)
- [Prisma Migrate Overview](https://docs.prisma.io/docs/v6/orm/prisma-migrate/understanding-prisma-migrate/overview)
- [Oso Resource Blocks](https://www.osohq.com/docs/modeling-in-polar/reference/resource-blocks)
