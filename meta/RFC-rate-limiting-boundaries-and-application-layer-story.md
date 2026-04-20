# RFC: Rate-Limiting Boundaries and the Consumer App Story

Status: Proposed
Date: 2026-04-20
Audience: Trellis maintainers and app authors

## Summary

Trellis should **not** become a universal rate-limiting framework for every Convex endpoint.

Trellis **should** own rate limiting for Trellis-owned surfaces:

- MCP ingress
- auth bridge passthrough to Better Auth
- docs, examples, and guardrails for app authors

Consumer apps **should** own application-layer rate limiting for business endpoints inside Convex.

Short version:

- `Trellis MCP limiter` = outer guard for tool traffic
- `Better Auth limiter` = auth abuse protection
- `Consumer app + Convex limiter` = business quotas and expensive endpoint protection

This RFC also rejects three bad directions:

- using generic Nitro storage read/modify/write as if it were a production-safe distributed limiter
- inferring delegation automatically from authenticated MCP users
- pretending `doctor` can prove real distributed safety by string-matching config text

## Why This RFC Exists

Recent review findings exposed a deeper problem than just one bad implementation.

The real problem is that the repo does not yet explain the full rate-limiting story clearly enough.

That creates three kinds of confusion:

1. Maintainers may try to stretch the MCP limiter into a global app limiter.
2. App authors may think Trellis already protects all Convex endpoints.
3. Junior developers may not know which layer should own which policy.

This RFC answers one question:

> Where should rate limiting live in Trellis-based apps, and what should Trellis itself own?

## Junior-Friendly Mental Model

Think about rate limiting in layers.

### Layer 0: Network and platform edge

Examples:

- CDN
- WAF
- reverse proxy
- hosting-provider abuse protection

Purpose:

- stop obvious floods
- absorb gross abuse
- protect infrastructure

This is **not** Trellis.

### Layer 1: Auth endpoints

Examples:

- sign in
- password reset
- email verification
- OAuth token endpoints

Purpose:

- slow down auth abuse
- protect credential and session workflows

This is primarily **Better Auth**.

Trellis only passes Better Auth config through in [src/runtime/auth/define-auth.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/auth/define-auth.ts:56).

### Layer 2: MCP ingress

Examples:

- `list-posts`
- `create-post`
- `bulk-delete-runbooks`

Purpose:

- stop agent/tool spam early
- reject abusive or accidental bursts before more work happens
- protect downstream Convex and third-party costs

This is **Trellis**.

The current MCP limiter is explicitly scoped to tool definitions in [src/runtime/mcp/types.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/mcp/types.ts:186) and enforced in:

- [src/runtime/mcp/define-convex-tool.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/mcp/define-convex-tool.ts:641)
- [src/runtime/mcp/define-mcp-app.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/mcp/define-mcp-app.ts:487)

### Layer 3: Application and business quotas

Examples:

- per-user message limits
- per-workspace LLM token budgets
- failed login counters
- upload quotas
- export throttles
- billing-tier restrictions

Purpose:

- enforce business rules fairly
- protect expensive app logic
- shape usage by user, workspace, or plan

This is primarily the **consumer app**, usually inside Convex.

## Current State

Today, Trellis has a clear but incomplete rate-limiting story.

### What Trellis already has

#### 1. MCP tool rate limiting

Trellis supports per-tool MCP rate limits.

Relevant code:

- [src/runtime/mcp/types.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/mcp/types.ts:186)
- [src/runtime/mcp/rate-limiter.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/mcp/rate-limiter.ts:20)

This is a good fit because MCP is a Trellis-owned transport surface.

#### 2. Better Auth rate-limit passthrough

Trellis exposes Better Auth rate-limit configuration in [src/runtime/auth/define-auth.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/auth/define-auth.ts:60).

This is also reasonable because Trellis owns the auth bridge, not auth policy itself.

#### 3. Strong auth and authorization

Trellis already has:

- guards
- permissions
- tenant isolation
- destructive confirmation
- trusted forwarding

These reduce abuse in important ways, but they are **not** substitutes for rate limiting.

### What Trellis does not have

Trellis does **not** currently provide a generic `rateLimit` option for all:

- `query(...)`
- `mutation(...)`
- `action(...)`
- `defineOperation(...)`

That is visible in normal generated app code such as [workspaceTodosTemplate.tpl](/Users/matthias/Git/0_libs/WORK/trellis/src/cli/templates/init/workspaceTodosTemplate.tpl:19), where handlers define guards and business logic but no Trellis-owned rate-limit primitive.

## The Core Problem

The problem is **not** that Trellis lacks enough rate-limit code.

The real problem is that rate limiting spans multiple layers, and each layer needs a different tool.

When one tool is stretched across the wrong layer, bad things happen:

- a cheap outer guard becomes a complicated business quota engine
- a business quota engine is misused as edge protection
- security semantics get mixed with throughput semantics
- docs start promising safety that the implementation does not really provide

## Goals

- Keep Trellis-owned rate limiting narrow and correct
- Explain the full rate-limiting story in one place
- Make the ownership boundary obvious to junior developers
- Prevent Trellis docs and scaffolds from teaching unsafe or misleading patterns
- Give consumer apps a clear, recommended application-layer path

## Non-Goals

- Turn Trellis into a universal rate-limiting DSL
- Add `rateLimit` to every Trellis function constructor right now
- Hide business quotas inside framework magic
- Infer represented identity from transport auth
- Claim that non-atomic shared storage is good enough for distributed enforcement

## Repo Evidence

### MCP rate limiting is Trellis-owned today

Tool-level option:

- [src/runtime/mcp/types.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/mcp/types.ts:186)

Enforcement points:

- [src/runtime/mcp/define-convex-tool.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/mcp/define-convex-tool.ts:641)
- [src/runtime/mcp/define-mcp-app.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/mcp/define-mcp-app.ts:487)

### Auth rate limiting is Better Auth-owned

Trellis bridge option:

- [src/runtime/auth/define-auth.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/auth/define-auth.ts:60)

Pass-through:

- [src/runtime/auth/define-auth.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/auth/define-auth.ts:315)

### Generic Convex business handlers are not Trellis-rate-limited

Example app handler:

- [workspaceTodosTemplate.tpl](/Users/matthias/Git/0_libs/WORK/trellis/src/cli/templates/init/workspaceTodosTemplate.tpl:19)

### Convex’s rate-limiter component is an application-layer tool

The component README explicitly frames itself as application-layer rate limiting in [external README](/Users/matthias/Git/external/convex-rate-limiter/README.md:35).

Its public API delegates into Convex functions:

- `check()` uses `ctx.runQuery(...)` in [src/client/index.ts](/Users/matthias/Git/external/convex-rate-limiter/src/client/index.ts:99)
- `limit()` uses `ctx.runMutation(...)` in [src/client/index.ts](/Users/matthias/Git/external/convex-rate-limiter/src/client/index.ts:134)

Its state is stored in Convex in [src/component/lib.ts](/Users/matthias/Git/external/convex-rate-limiter/src/component/lib.ts:18).

It supports richer policy than Trellis MCP:

- fixed window
- token bucket
- reservation
- sharding
- count-based consumption
- reset/check/getValue

Source:

- [src/shared.ts](/Users/matthias/Git/external/convex-rate-limiter/src/shared.ts:12)

## External Research

This RFC is also informed by current upstream docs.

### Better Auth

Better Auth documents built-in auth rate limiting and notes that:

- rate limits are primarily for client-initiated auth traffic
- storage can be memory, database, secondary storage, or custom storage

Source:

- [Better Auth rate limit docs](https://www.better-auth.com/docs/concepts/rate-limit)

### Convex

Convex docs explicitly warn that extra `ctx.runQuery(...)` and `ctx.runMutation(...)` calls mean extra function calls and consistency tradeoffs.

Source:

- [Convex actions docs](https://docs.convex.dev/functions/actions)

Convex pricing currently bills or limits usage by function calls, action compute, and database I/O.

Source:

- [Convex pricing](https://www.convex.dev/pricing)

## Options Considered

## Option A: Trellis becomes the universal rate-limiting framework

Description:

- add Trellis-native `rateLimit` to general handlers
- own distributed stores
- own app-level quotas
- make Trellis the one place for all rate limiting

### Pros

- one mental entry point
- less initial choice for app authors
- more framework-driven consistency

### Cons

- too much policy inside the framework
- forces Trellis to pick business semantics it does not own
- turns Trellis into a bigger, more brittle abstraction
- creates pricing and storage tradeoffs Trellis cannot solve generically
- pushes maintainers toward transport-wide magic

### Verdict

Rejected.

This is too broad and will age badly.

## Option B: Keep Trellis MCP-only and say nothing else

Description:

- keep the current MCP limiter
- leave app authors to figure out the rest on their own

### Pros

- smallest framework surface
- low maintenance burden

### Cons

- docs stay incomplete
- app authors keep guessing
- junior developers keep asking the same ownership question
- the same design confusion will return in future PRs

### Verdict

Too passive.

## Option C: Clear boundaries, clear docs, and explicit application-layer guidance

Description:

- Trellis owns MCP ingress rate limiting
- Better Auth owns auth endpoint rate limiting
- consumer apps own business endpoint rate limiting inside Convex
- Trellis documents the full story and recommends the Convex component for application-layer quotas

### Pros

- each layer uses the right tool
- keeps Trellis small and honest
- teaches the architecture clearly
- avoids pretending that one limiter fits every use case
- gives consumer apps a recommended path without hiding policy

### Cons

- requires app authors to make some choices
- introduces one more concept for juniors to learn
- means Trellis must invest in good docs and examples

### Verdict

Recommended.

## Option D: Generic Nitro storage backend for distributed MCP limits

Description:

- support a generic storage driver based on `getItem()` / `setItem()`
- treat shared storage as production-safe distributed enforcement

### Pros

- backend-agnostic on paper
- easy to explain superficially

### Cons

- naive read/modify/write is race-prone
- overclaims correctness unless the store provides an atomic consume primitive
- teaches false confidence
- confuses “shared storage exists” with “distributed rate limit is correct”

### Verdict

Rejected.

This is exactly the kind of abstraction Trellis should not paper over.

## Option E: Use the Convex component as the only limiter everywhere

Description:

- remove or minimize Trellis MCP limits
- use the Convex component for both outer and inner rate limiting

### Pros

- one rate-limit engine
- rich semantics
- strong application-layer feature set

### Cons

- outer abuse protection now consumes Convex calls and I/O
- weaker cost-control story at the MCP ingress boundary
- mixes business quota logic with transport protection
- poorer fit for rejecting junk before it reaches Convex

### Verdict

Rejected.

The Convex component is strong, but it is the wrong default for the outer MCP guard.

## Recommendation

Trellis should adopt **Option C**.

That means:

1. Keep Trellis rate limiting **MCP-only** for now.
2. Keep Better Auth rate limiting **auth-only**.
3. Recommend the Convex rate-limiter component for **consumer-app business quotas**.
4. Explain the whole layering model clearly in docs and examples.
5. Do not add a generic Trellis-wide function-level rate-limit API in this wave.

## Explicit Rejections

This RFC explicitly rejects the following patterns.

### Rejection 1: Implicit delegation

Delegation is represented identity. It must stay explicit.

Trellis must **not** synthesize:

```ts
{
  subject: `user:${actor.userId}`,
  reason: 'user-approved MCP session',
}
```

just because an MCP request is authenticated.

Why:

- it changes authorization semantics
- it violates the explicit delegation contract
- it teaches the wrong security model in scaffolds

### Rejection 2: “Production-safe” shared storage without atomicity

Trellis must **not** present this kind of flow as production-grade distributed enforcement:

1. `getItem(key)`
2. compute next count
3. `setItem(key, nextState)`

Why:

- it races under concurrency
- it can allow more requests than configured
- it gives users false confidence

### Rejection 3: Doctor checks that only prove text exists

`trellis doctor` must not claim distributed readiness just because:

- a namespace string appears in config
- some storage block exists somewhere

Doctor should only validate what Trellis can honestly know.

## What Trellis Should Own

### 1. MCP ingress protection

Trellis should keep a simple, explicit MCP rate limiter.

Properties:

- per-tool
- principal-scoped where available
- simple backpressure semantics
- cheap rejection before more work happens

### 2. Auth bridge passthrough

Trellis should continue exposing Better Auth’s auth-specific rate-limit configuration, but only as passthrough.

### 3. Documentation and examples

Trellis should explain:

- which layer owns which limiter
- when to use Trellis MCP limits
- when to use Better Auth limits
- when to use the Convex component
- how pricing changes between layers

## What Consumer Apps Should Own

Consumer apps should own rate limiting for their own business endpoints.

Typical use cases:

- per-user messaging quotas
- per-workspace LLM request caps
- token budgets
- upload quotas
- export throttles
- invite/signup policies
- abuse control for specific public endpoints

## Examples

## Example 1: MCP tool rate limit in Trellis

This is a Trellis concern.

```ts
export default tool({
  schema: listPosts,
  call: api.domain.posts.list,
  operation: 'query',
  permission: workspaceRead,
  rateLimit: { max: 20, window: '1m' },
  meta: {
    name: 'list-posts',
  },
})
```

Use this when you want to protect the MCP surface itself.

## Example 2: Better Auth rate limit in Trellis

This is still auth-specific, not a general app limiter.

```ts
defineAuth(deps, {
  rateLimit: { storage: 'database' },
})
```

Use this when protecting auth flows.

## Example 3: Consumer app business quota inside Convex

This is the right place for application-layer policy.

```ts
export const create = mutation({
  args: createTodo.args,
  guard: hasWorkspace.and(hasMinimumRole('member')),
  handler: async (ctx, args) => {
    const actor = await ctx.actor()

    const status = await rateLimiter.limit(ctx, 'createTodo', {
      key: actor.tenantId,
      throws: true,
    })

    return await ctx.db.insert('todos', {
      workspaceId: actor.tenantId,
      title: args.title,
      completed: false,
      createdAt: Date.now(),
    })
  },
})
```

Use this when protecting business logic, not transport ingress.

## Example 4: Using both layers together

This is the recommended “expensive MCP tool” story.

Outer layer:

- Trellis MCP `rateLimit` on the tool

Inner layer:

- Convex component limit inside the called mutation/action

That gives you:

- cheap early rejection
- durable business quotas

## Pricing Story

This needs to be explicit, because the right layer also changes cost.

### Trellis MCP limiter

If Trellis rejects an MCP request before Convex work starts:

- fewer Convex function calls
- less Convex I/O
- lower downstream load

Tradeoff:

- if using Redis for distributed MCP limits, you pay Redis or equivalent infrastructure cost

### Convex application-layer limiter

The Convex component performs rate-limit work inside Convex.

That means it can add:

- extra function calls
- extra database reads and writes
- extra contention under heavy use

That is not necessarily bad. It is just the correct cost model for application-layer policy.

The important point is:

> Use the expensive, richer limiter only where richer policy is actually needed.

## What Trellis Should Do Next

### Phase 1: Documentation

Add one canonical docs page explaining:

- edge vs auth vs MCP vs business-layer rate limiting
- which limiter belongs where
- pricing tradeoffs

### Phase 2: Example app guidance

Add one real example showing:

- MCP tool rate limit in Trellis
- Convex component quota in a called mutation
- explanation of why both exist

### Phase 3: CLI and doctor alignment

The CLI should:

- stop teaching implicit delegation
- avoid overclaiming distributed safety
- only validate conditions it can prove honestly

### Phase 4: Revisit generic handler-level rate limiting only if evidence appears

Do not add a Trellis-wide `rateLimit` to general handlers unless real app evidence shows repeated, correct patterns that justify it.

## Acceptance Criteria

This RFC is successful when:

1. A junior developer can answer “which limiter goes where?” after reading the docs once.
2. Trellis docs stop implying that MCP rate limiting protects all Convex endpoints.
3. Trellis scaffolds stop teaching implicit delegation.
4. `doctor` stops overclaiming distributed correctness.
5. App authors have one recommended example for business quotas inside Convex.

## FAQ

### Should Trellis rate-limit every Convex function?

No.

That is too blunt and too framework-owned.

Most handlers should rely on:

- auth
- guards
- permissions
- tenant isolation

Add application-layer rate limiting only where abuse, cost, or fairness actually justify it.

### Is the Convex rate-limiter component “instead of” Trellis MCP rate limiting?

Usually no.

They solve different problems.

- Trellis MCP limiter = outer guard
- Convex component = inner business quota

### Should consumer apps use both?

Sometimes yes.

If an MCP tool triggers expensive or quota-sensitive business logic, using both layers is often the right design.

### Why not just use one powerful limiter everywhere?

Because powerful is not the same as correct.

The wrong limiter in the wrong layer creates:

- cost problems
- policy confusion
- misleading docs
- brittle abstractions

## References

- [src/runtime/mcp/types.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/mcp/types.ts:186)
- [src/runtime/mcp/define-convex-tool.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/mcp/define-convex-tool.ts:641)
- [src/runtime/mcp/define-mcp-app.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/mcp/define-mcp-app.ts:487)
- [src/runtime/auth/define-auth.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/auth/define-auth.ts:56)
- [workspaceTodosTemplate.tpl](/Users/matthias/Git/0_libs/WORK/trellis/src/cli/templates/init/workspaceTodosTemplate.tpl:19)
- [Convex rate-limiter README](/Users/matthias/Git/external/convex-rate-limiter/README.md)
- [Convex rate-limiter client wrapper](/Users/matthias/Git/external/convex-rate-limiter/src/client/index.ts:99)
- [Convex rate-limiter component lib](/Users/matthias/Git/external/convex-rate-limiter/src/component/lib.ts:18)
- [Convex rate-limiter shared types](/Users/matthias/Git/external/convex-rate-limiter/src/shared.ts:12)
- [Better Auth rate limit docs](https://www.better-auth.com/docs/concepts/rate-limit)
- [Convex actions docs](https://docs.convex.dev/functions/actions)
- [Convex pricing](https://www.convex.dev/pricing)
- [Convex rate-limiting article](https://stack.convex.dev/rate-limiting)
