# Dream v2: From Framework to Toolkit

## Thesis

`@lupinum/trellis` should stop feeling like "the one blessed app shape" and start feeling like a set of composable safety primitives.

That does **not** mean "add more layers."

It means:

- split coupled concerns apart
- make safety visible in the handler shape
- keep app-owned policy code app-owned
- remove boilerplate that does not carry business meaning

The current package already has the right instincts:

- shared schemas are runtime-neutral
- actor resolution is app-owned
- permission checks are plain functions
- visibility and testing already exist as separate entrypoints
- MCP tools are declarative and structurally safer than Convex handlers

The problem is that the center of gravity is still `createFunctions(...)`, which bundles multiple concerns into one factory and leaves critical safety checks as "remember to do this in the handler body."

That is the gap.

## Status

This document is now serving as a working scorecard, not just a wish list.

### Implemented experimentally

- `defineActor`
- `defineGuard`
- `open`
- `defineHandler`
- `defineCapabilities`
- `defineRedaction`
- `definePermissionContext`

### Checked and deferred

- `defineScope`
- stronger `defineVisibility` planning
- handler middleware
- `defineTest`

### Important finding from real tests

When `defineHandler(...)` is layered on top of `createFunctions(...)`, tenant isolation runs before structured `authorize` on cross-tenant resource loads.

That is good.

It means:

- scope-like isolation remains the first defense line
- resource authorization still matters inside the tenant
- the final handler model should preserve that ordering intentionally

## What v2 Should Preserve

These are load-bearing and should survive a redesign.

### 1. App-owned actor meaning

The library should help resolve an actor, not define what an actor means.

Current good shape:

- you own `convex/auth/actor.ts`
- checks consume your actor type
- examples can scale from personal apps to workspace and agency models

### 2. Plain-function permission logic

Checks like `canUpdateTodo(todo)` being plain functions is correct. This is easier to test, easier to refactor, and easier to reason about than decorators or schema annotations.

### 3. Shared schemas

`defineArgs()` and the `shared/` contracts are already one of the strongest parts of the package. This should remain a first-class primitive and should not be replaced with Convex-only abstractions.

### 4. Convex schema purity

Do not wrap `defineTable`. Do not introduce a schema DSL. The library should compose around Convex, not attempt to become Convex.

### 5. App-owned safety files

Like shadcn, the package should scaffold files users own:

- actor
- guards
- scopes
- redaction
- visibility
- permission context

No hidden generator state. No always-regenerated directory.

## Where the Current Design Breaks Down

### 1. `createFunctions(...)` is the coupling point

Today one config bag handles:

- actor resolution
- trusted caller transport
- tenant isolation
- row-level rules
- mutation triggers
- success hooks

That is too much.

This is the clearest sign that the library still behaves like a framework instead of a toolkit.

### 2. Convex handlers are structurally less safe than MCP tools

MCP tools already have declaration-time structure:

- `auth`
- `scoped`
- `check`
- `destructive`
- `middleware`

Convex handlers do not. They still rely on manual `enforce(...)`, `requireRecord(...)`, `ensureTenant(...)`, and ad hoc loading inside the body.

That is backward. Protected handlers should be at least as structured as tools.

### 3. `_can` is correct but repetitive

`withCan(...)` is a useful primitive, but requiring every list and get handler to map capabilities by hand does not scale.

### 4. Testing still exposes wiring

`createConvexTestModules(...)` and `convexServerMock()` are useful, but the repeated `test.setup.ts` files are boilerplate with no app meaning.

### 5. `definePermissions(...)` is too manual

The current version removes some repetition, but the permission map is still hand-assembled and easy to drift from the guard definitions.

### 6. Visibility is too weakly modeled

`defineVisibility(...)` is currently just "return an array or a query-like object." That is flexible, but it does not capture enough structure to help with planning, reuse, or optimization.

## Design Rules for v2

### 1. Prefer hard cutovers

Do not build v2 as a compatibility shell around `createFunctions(...)`.

If the new center is `defineHandler`, then `defineHandler` should become the real model. Avoid a long dual-path architecture where every feature exists twice.

### 2. Prefer explicit declarations over inference

Good:

- `guard: canReadTodo`
- `scope: workspaceScope`
- `capabilities: todoCapabilities`

Bad:

- infer scope from schema
- infer permission context from arbitrary imports
- infer visibility from table annotations

### 3. Prefer inspectable objects over anonymous functions when the library needs structure

Plain functions are still fine for local logic. But if the library needs labels, composition metadata, docs, or auto-derived frontend state, then the thing being passed around must be inspectable.

That is the argument for `defineGuard(...)`.

### 4. Do not promise fake compile-time safety

TypeScript can enforce handler shape.
TypeScript cannot prove that a resource loaded at runtime satisfies a business rule.

So v2 should claim:

- structural safety for declaration-time omissions
- runtime safety for loaded resources

It should **not** pretend that every auth property is statically solvable.

### 5. Keep the business logic body boring

The handler body should mostly contain:

- queries
- writes
- transformations
- orchestration

Not:

- auth ceremony
- resource existence ceremony
- repeated tenant checks
- repeated `_can` attachment

## Proposed Primitive Set

## 1. `defineActor`

### Goal

Replace "one resolver function" with a composable actor builder.

### Why it makes sense

The current package already has:

- `createDefaultGetActor()`
- `defineActorExtension(...)`
- `defineActorFromMembership(...)`

So the idea is already here. The problem is that the extension model is shallow and asymmetric.

### Direction

```ts
const actor = defineActor.fromAuth<DataModel>()

const withRole = actor.extend({
  fields: async (ctx, user) => ({ role: user.role }),
})

const withPlan = withRole.extend({
  fields: async (ctx, user) => ({ plan: await resolvePlan(ctx, user) }),
})

export const getActor = withPlan.resolve
export type Actor = typeof withPlan.type
```

### Feasibility

High.

This is mostly a repackaging and strengthening of APIs that already exist.

### Status

Checked, not implemented.

Reason:

- current `createDefaultGetActor()`, `defineActorExtension(...)`, and `defineActorFromMembership(...)` already cover part of the need
- the missing work is mostly API reshaping, not missing capability
- this should be revisited only after the handler model settles

## 2. `defineGuard`

### Goal

Turn permission checks into labeled, composable, inspectable values.

### Why it makes sense

Current checks are plain functions, which is good for local use, but weak for:

- better error messages
- auto-generated docs
- permission registries
- derived frontend permission context

### Direction

```ts
export const canCreateTodo = defineGuard(
  'todo.create',
  (actor) => !!actor && actor.role !== 'viewer',
)

export const canUpdateTodo = (todo: Doc<'todos'>) =>
  defineGuard(
    'todo.update',
    (actor) => !!actor && (actor.role === 'owner' || actor.userId === todo.ownerId),
  )
```

### Important pushback

Resource-bound guards cannot be globally auto-derived in the same way actor-only guards can.

That means:

- actor-only guards are good input for frontend permission context
- resource-bound guards are better input for `_can` capabilities

Trying to collapse both into one "permissions registry" will create lies.

### Feasibility

High.

The hard part is API design, not implementation.

### Status

Implemented experimentally.

Current repo state:

- `defineGuard(...)` exists
- guards are callable, labeled, and inspectable
- `.and()`, `.or()`, and `.not()` exist
- `open` exists as the explicit public-access guard

## 3. `defineHandler`

### Goal

Make guard, load, scope, and middleware structural parts of a Convex handler.

### Why it makes sense

This is the main missing primitive. Without it, the package cannot really claim structural safety.

### Direction

```ts
export const update = defineHandler.mutation({
  guard: canReadTodo,
  scope: workspaceScope,
  args: { id: v.id('todos') },
  load: async (ctx, args) => ({
    todo: await ctx.loadResource(args.id, 'Todo'),
  }),
  authorize: (actor, { todo }) => canUpdateTodo(todo),
  handler: async (ctx, args, { todo }) => {
    await ctx.db.patch(todo._id, { completed: true })
  },
})
```

### Important pushback

One `guard` property is not enough for every case.

There are really two layers:

- actor-level access to enter the handler
- resource-level authorization after loading

If v2 forces both into a single overloaded `guard`, the API will get muddy. A split like `guard` + `authorize` is probably cleaner.

### Feasibility

Medium-high.

This is a real redesign. It likely becomes the new center of the package and should replace, not wrap, `createFunctions(...)`.

### Status

Implemented experimentally and verified against a real actor-aware builder path.

Current repo state:

- `defineHandler(...)` exists
- `guard` is mandatory
- `open` handles the explicit public case
- `load` and `authorize` are separate phases
- unit tests cover the structural flow
- internal harness tests prove it composes on top of `createFunctions(...)`

Current limitation:

- this is still an adapter over existing builders, not the final cutover model

## 4. `defineScope`

### Goal

Make tenant or workspace scoping a composable primitive instead of one property on `createFunctions(...)`.

### Why it makes sense

Current tenant isolation is global to the factory instance. But scope is often handler-specific.

### Direction

```ts
export const workspaceScope = defineScope<DataModel>({
  field: 'workspaceId',
  index: 'by_workspace',
  tables: ['todos', 'projects', 'tasks'],
})
```

### Important pushback

Be careful about promising "automatic query rewriting."

Convex query APIs are not infinitely pliable. The first realistic version may be:

- validated inserts and writes
- scoped resource loads
- helper query entrypoints for scoped tables

That is still valuable. Do not overpromise magical transparent DB behavior if the implementation gets brittle.

### Feasibility

Medium.

The write-safety part is straightforward.
The read ergonomics need careful design.

### Status

Checked, not implemented.

Reason:

- the real problem is not config shape, it is how much transparent DB behavior Convex can support without becoming brittle
- the real-builder tests showed that existing tenant isolation ordering is already meaningful
- this should land only after deciding whether v2 keeps wrapping DB access or moves to explicit scoped helpers

## 5. `defineCapabilities`

### Goal

Define per-resource `_can` mapping once and reuse it everywhere.

### Direction

```ts
export const todoCapabilities = defineCapabilities<Doc<'todos'>>()({
  update: (actor, todo) => canUpdateTodo(todo),
  delete: (actor, todo) => canDeleteTodo(todo),
})
```

### Important pushback

Capabilities should probably be attached explicitly, not magically inferred from arbitrary return values.

Good:

- `return ctx.capabilities(todoCapabilities).attach(todos)`

Maybe okay:

- `capabilities: todoCapabilities` on a handler that returns a flat resource array

Risky:

- silently walking any nested return payload and patching `_can` onto matching docs

The explicit version is less magical and easier to trust.

### Feasibility

High.

This is a focused primitive with clear value.

### Status

Implemented experimentally.

Current repo state:

- `defineCapabilities(...)` exists in `@lupinum/trellis/visibility`
- attachment is explicit through `.attach(actor, value)`
- works for single resources and arrays
- intentionally does not try to walk nested payloads magically

## 6. `definePermissionContext`

### Goal

Generate the frontend permission payload from a declared guard registry.

### Direction

```ts
export const permissionContext = definePermissionContext({
  guards: {
    'todo.create': canCreateTodo,
    'workspace.members': canManageMembers,
  },
  extend: async (ctx, actor) => ({
    role: actor.role,
    plan: actor.plan,
  }),
})
```

### Important pushback

Only actor-level guards belong here.

If a check needs a resource instance, it is not a global permission key.

That distinction should be enforced by the type system if possible.

### Feasibility

High.

This is an evolution of the current `definePermissions(...)`.

### Status

Implemented experimentally.

Current repo state:

- `definePermissionContext(...)` exists
- `definePermissions(...)` remains for backward compatibility
- both produce the existing `usePermissions()` payload shape
- tests cover guard-based generation and legacy behavior stability

## 7. `defineVisibility`

### Goal

Model row visibility with more structure than "return me an array or query."

### Direction

The next version should distinguish:

- queryable rules
- post-filter rules
- bypass rules
- optional redaction pairing

### Important pushback

Full "index-aware automatic DB pushdown" is an attractive idea, but likely too ambitious as a first principle.

A more honest first version is:

- visibility declarations that can optionally expose query hints
- a planner that uses hints when available
- explicit fallback to in-memory filtering when needed

That gives the package room to improve without claiming more than it can reliably do.

### Feasibility

Medium.

Useful, but this should come after handlers, guards, and capabilities.

### Status

Checked, not implemented beyond the existing `defineVisibility(...)`.

Reason:

- the current primitive still works
- the planner/pushdown story needs more evidence before it becomes public API
- it is better to defer than to ship fake index awareness

## 8. `defineRedaction`

### Goal

Make field-level stripping a reusable primitive instead of ad hoc helper functions.

### Feasibility

High.

This is small, clean, and obviously useful.

### Status

Implemented experimentally.

Current repo state:

- `defineRedaction(...)` exists in `@lupinum/trellis/visibility`
- redaction is reusable and explicit
- works for single resources and arrays

## 9. `defineMiddleware`

### Goal

Unify cross-cutting behavior between Convex handlers and MCP tools.

### Why it matters

MCP tools already have middleware.
Convex handlers do not.

That means the more structured API already exists on the MCP side.

v2 should close that gap with one middleware mental model.

### Important pushback

Keep middleware small and boring:

- before
- after
- around

Do not turn it into a second policy system. Auth and scope should stay first-class handler properties.

### Feasibility

Medium-high.

### Status

Checked, not implemented.

Reason:

- the need is real, especially because MCP tools already have middleware
- but the correct interaction with `guard`, `load`, `authorize`, and future scope primitives should be designed together
- shipping middleware first would risk making it a second policy system

## 10. `defineTest`

### Goal

Delete repeated `test.setup.ts` boilerplate.

### Direction

The best shape may not literally be one `defineTest(...)` call.

Possible options:

- a Vitest helper that emits both config and runtime setup
- a `@lupinum/trellis/testing/vitest` entrypoint
- a helper macro around `convexTestConfig(...)`

### Important pushback

The current proposal of "one line and no setup file" is desirable, but it depends on how much control Vitest gives us over ESM mocking and generated module stubs.

So the real goal is not "exactly zero files."
The real goal is "no repeated user-maintained wiring."

### Feasibility

Medium.

Very worth exploring, but the implementation constraints are external.

### Status

Checked, not implemented.

Reason:

- the boilerplate problem is real
- but the final shape depends on Vitest and generated-module mocking constraints
- this should be solved after the runtime surface is more settled

## What v2 Should Not Do

### 1. Do not hide app policy in generated code

Scaffold once, then the user owns the file.

### 2. Do not auto-infer from schema decorations

That turns a composable toolkit back into a framework with magic.

### 3. Do not mix actor-level permissions and resource-level capabilities

Those are related, but not the same thing.

### 4. Do not promise invisible automatic `_can` everywhere

A little explicitness is better than spooky action.

### 5. Do not keep `createFunctions(...)` as the permanent center

If the diagnosis is right, then v2 should cut over.

## Proposed v2 Shape

If the redesign succeeds, the public surface should read roughly like this:

- `@lupinum/trellis/auth`
  - `defineActor`
  - `defineGuard`
  - `definePermissionContext`
  - `deny`
  - `can`
  - `requireRecord`
- `@lupinum/trellis/functions`
  - `defineHandler`
  - `defineScope`
  - `defineMiddleware`
- `@lupinum/trellis/visibility`
  - `defineVisibility`
  - `defineRedaction`
  - `defineCapabilities`
- `@lupinum/trellis/testing`
  - `defineTest`
  - `convexTestConfig`

Not every existing export needs to survive if the new primitive supersedes it.

## Recommended Experiment Sequence

This should be validated through narrow experiments, not a big rewrite.

### Experiment 1. Guard objects

Build:

- `defineGuard(...)`
- `.and()`, `.or()`, `.not()`
- labels and inspectability

Success criteria:

- no regression in ergonomics versus plain functions
- guard labels remove hand-typed `enforce(..., "label")` strings
- actor-level guard registries become type-safe

### Experiment 2. Safe handler prototype

Build a prototype `defineHandler.query(...)` and `defineHandler.mutation(...)` in the internal harness only.

Success criteria:

- handler definitions read more clearly than current `appQuery/appMutation`
- omission of guard/scope/load steps is structural, not convention-based
- typed `ctx.actor` narrowing feels real, not fake

### Experiment 3. Capabilities attachment

Prototype `defineCapabilities(...)` plus an explicit attach API.

Success criteria:

- replaces repetitive `withCan(...)` maps in examples 03, 04, and 07
- avoids magic nested return-value rewriting

### Experiment 4. Permission context registry

Evolve `definePermissions(...)` into `definePermissionContext(...)`.

Success criteria:

- single declaration for keys and checks
- impossible or discouraged to register resource-bound checks

### Experiment 5. Handler middleware

Port the MCP middleware mental model to Convex handlers.

Success criteria:

- audit logging and rate limiting can be extracted cleanly
- middleware does not become a substitute for auth declarations

### Experiment 6. Testing cutover

Try to eliminate repeated `test.setup.ts` files without introducing hidden complexity.

Success criteria:

- fewer moving pieces in example tests
- no loss of explicitness where Vitest actually requires it

### Experiment 7. Visibility planner

Strengthen `defineVisibility(...)` only after the core handler model is stable.

Success criteria:

- improves example 05 meaningfully
- supports explicit fallback from indexed filtering to in-memory filtering

## Ranking: What Matters Most

If we only do three things, they should be:

1. replace `createFunctions(...)` with a structural handler API
2. turn guards into inspectable primitives
3. remove repetitive `_can` mapping

That is where the design changes from "framework helpers" to "toolkit primitives."

Testing, visibility planning, and scaffolding matter, but they are downstream of getting the handler model right.

## Working Definition of Done

v2 is successful if:

- the safety model is visible from the handler declaration
- examples 01 through 07 use the same small primitive set
- the business logic body loses most auth and scope ceremony
- app-owned policy files remain plain TypeScript that users can freely edit
- the package surface gets smaller in concepts, not larger

If v2 requires more concepts than v1, the redesign is probably wrong.
