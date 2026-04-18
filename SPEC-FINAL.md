# Trellis Final Spec

> **Status: Canonical product spec**
>
> This is the most important document in the repo.
>
> Read this file to understand:
>
> - what Trellis is for
> - who it is for
> - what the final shape should be
> - how the parts connect
> - which tradeoffs are intentional
> - which problems we still need to solve
>
> This document replaces `SPEC.vNext.md` as the primary product direction.

---

## 1. Purpose

Trellis exists to make it cheap and safe to build many apps on the same stack:

- Nuxt
- Convex
- Better Auth
- MCP

The goal is not to be a general-purpose framework for everyone.

The goal is to be the best internal app platform for repeatedly shipping:

- CMS apps
- workspace apps
- SaaS apps
- admin tools
- support tools
- agent-enabled apps

If Trellis cannot make app number 7 easier than app number 1, it is failing.

## 2. Thesis

**Trellis is the application platform for Nuxt + Convex apps that want app-owned auth, tenancy, permissions, operations, and MCP on one shared backend model.**

That means:

- one stack
- one package
- one strong set of opinions
- one backend model reused across browser, server, webhook, and agent callers

Trellis is not trying to be neutral.

Lock-in is intentional:

- Better Auth is the auth path
- Convex is the backend path
- Nuxt is the UI path
- MCP is a first-class path, not an afterthought

When the same team is building many apps on the same stack, opinionation is a feature.

## 3. The Real Problem

Convex already gives one backend. That is true.

Trellis is not valuable because Convex cannot share functions.

Trellis is valuable because repeated real apps still need a shared application model around those functions:

- how callers are identified
- how app actors are resolved
- how tenant boundaries are enforced
- how permissions are structured
- how server routes forward identity safely
- how destructive work is previewed and confirmed
- how MCP tools reuse the same business actions
- how observability exposes trust-boundary crossings

So the Trellis problem statement is:

**Convex gives backend primitives. Trellis gives a repeatable application architecture on top of them.**

That is the honest pitch.

## 4. Who Trellis Is For

Trellis is for:

- the team building multiple apps on the same stack
- teams that want one default architecture, not infinite flexibility
- teams that expect multi-tenant or multi-caller complexity
- teams that want MCP support to reuse the same backend model

Trellis is not optimized for:

- one-off side projects
- framework-agnostic consumers
- auth-provider swapping
- minimal abstraction as a value in itself

If someone wants plain Convex plus a few helpers, Trellis is too much.

That is acceptable.

## 5. Product Promise

Trellis succeeds if all of this becomes true:

- a new app can be scaffolded in one command
- the scaffold already contains the correct auth, actor, and backend wiring
- simple apps can stay simple
- advanced apps can add tenancy, permissions, operations, and MCP without changing architecture
- browser, server, webhook, and MCP calls can hit the same protected backend model
- trust-boundary mistakes are visible in code review and logs

The product promise is not “less code at any cost.”

The product promise is:

**the safest, fastest default way to build repeated apps on this stack**

## 6. Product Shape

Trellis should be treated as an app platform, not as a bag of primitives.

The ideal product shape is:

- one package: `@lupinum/trellis`
- one CLI: `trellis`
- one canonical config surface
- a small set of app templates
- a strong file layout convention
- a narrow set of core runtime concepts

The center of gravity should move away from manual boilerplate and toward:

- generators
- templates
- defaults
- validation
- runtime enforcement

## 7. App Archetypes

Trellis should ship with first-class archetypes, not just examples.

The initial archetypes should be:

- `personal`
- `workspace`
- `cms`
- `support-inbox`
- `admin-console`
- `agent-console`

Every archetype should answer:

- which auth shape is used
- whether tenant isolation is on
- whether permission context exists
- whether MCP is enabled
- which starter schema and domain modules exist
- which pages and server routes are scaffolded

The archetype is the product.

The raw primitives are the engine underneath it.

## 8. Golden Setup Experience

The dream setup is:

```bash
trellis init ginko-cms --template=cms
trellis add uploads
trellis add operation publishEntry
trellis doctor
```

The user should not hand-wire the same auth and actor glue in every app.

The default generated app should already be coherent.

The correct tradeoff is:

- more code generated once
- less framework ceremony repeated forever

## 9. Canonical App Shape

The target file layout should be strict and boring.

```text
app/
client/
convex/
  app.ts
  schema.ts
  auth/
  domain/
  permissions/
  operations/
  server/
shared/
  schemas/
server/
  api/
  mcp/
pages/
```

Rules:

- auth lives in `convex/auth/`
- domain logic lives in `convex/domain/`
- permissions live in `convex/permissions/`
- reusable operations live in `convex/operations/`
- shared value contracts live in `shared/schemas/`

Every Trellis app should look close enough that moving between apps has near-zero cognitive tax.

## 10. Layer Model

Trellis sits on top of the stack like this:

- Nuxt owns UI, routing, SSR, and page ergonomics
- Convex owns data, queries, mutations, actions, and reactivity
- Better Auth owns identity and sessions
- Trellis owns the application model

The Trellis application model includes:

- principal resolution
- actor resolution
- protected handler structure
- permission boundaries
- tenant enforcement
- operation semantics
- server identity forwarding
- MCP projection
- observability around trust boundaries

This layer model is the center of the framework.

## 11. Core Runtime Concepts

The core concepts that should remain first-class are:

- principal
- actor
- guard
- load
- authorize
- handler
- tenant isolation
- operation
- `ctx.db`
- `ctx.db.crossTenant`
- `ctx.db.raw`

Anything else must justify itself against these.

If a concept exists only because the current API grew around an awkward spot, it should be removed or absorbed.

## 12. Caller Model

Every incoming call should be explainable through one path:

1. resolve principal
2. resolve actor
3. evaluate guard
4. load required records
5. evaluate authorization
6. execute handler
7. emit observability around important decisions

This must hold across:

- browser calls
- server route calls
- trusted server-to-server calls
- webhook-style calls
- MCP tool calls

The runtime must not invent separate policy engines per transport.

## 13. Identity Model

Trellis keeps the distinction between:

- `principal`: how the call arrived
- `actor`: who this maps to in the app

This distinction stays.

But the product must become stricter about when forwarded identity is allowed.

Rules:

- forwarded principals are only valid on explicitly trusted paths
- public or ambiguous paths must not accept silently forwarded identity
- actor bootstrap failures must fail loudly
- signed-in-but-no-actor should be a first-class misconfiguration signal

The current idea is right.

The safety and ergonomics around it still need tightening.

## 14. Tenant Model

Tenant isolation is one of Trellis's strongest differentiators and should remain a core promise.

The default model is:

- `ctx.db` is tenant-scoped when tenant isolation is enabled
- `ctx.db.crossTenant` bypasses tenant isolation only
- `ctx.db.raw` is the total escape hatch

Rules:

- the default path must be safe by construction
- bypasses must be explicit
- bypasses must be observable
- the runtime must enforce the guarantees, not just the docs

This is not optional flavor.

This is a core part of Trellis's value.

## 15. Permission Model

Trellis should keep backend-owned permissions.

But it should reduce unnecessary daily exposure to permission machinery.

The intended model is:

- backend checks remain authoritative
- frontend reads projected capabilities when it needs coarse UI decisions
- record-specific decisions stay in backend authorization, not in client reimplementation

The framework should not force every app to think deeply about permission projection on day 1.

Simple lane:

- protected handlers only

Workspace lane:

- permission context added

Advanced lane:

- rich capability projection

The model stays.

The exposure should become progressive.

## 16. Operations Model

Operations are another core differentiator and should remain central.

An operation is the reusable shape for a meaningful business action:

- guard
- load
- authorize
- preview
- execute

Operations matter most for:

- destructive work
- admin flows
- MCP reuse
- preview/confirm UX

The crucial promise is:

**preview and execute must not drift.**

That promise must remain enforced in runtime.

## 17. MCP Model

MCP is not an addon.

Trellis should continue treating MCP as a first-class transport for the same backend model.

That means:

- MCP tools should project existing backend actions
- destructive MCP tools should remain operation-backed
- confirmation and drift checks remain runtime-enforced
- capability gating should never be mistaken for the real authorization boundary

The core safety comes from protected backend handlers and operations.

The MCP layer should remain thin over those truths.

## 18. Nuxt Model

Nuxt integration should stay first-class because Trellis is building for repeated Nuxt apps.

Nuxt responsibilities in Trellis:

- SSR query ergonomics
- live-query handoff
- auth state composables
- uploads
- server helper integration
- page-level route protection

But Nuxt ergonomics should not leak framework confusion into every app.

This means:

- fewer naming traps
- fewer surprising defaults
- simpler setup docs
- better generated app shells

## 19. CLI and Templates

The CLI is not a side feature.

The CLI is how Trellis becomes cheap enough to use repeatedly.

The CLI must own:

- project scaffolding
- feature scaffolding
- template generation
- doctor checks
- config validation
- upgrade guidance

The runtime should stop carrying repeated manual setup that the CLI could generate once.

The right pattern is:

- runtime enforces
- CLI scaffolds
- doctor validates

## 20. Defaults

Trellis should prefer strong defaults over flexible setup.

Examples:

- one default auth path
- one default actor bootstrap shape per template
- one default file layout
- one default naming scheme for permissions and operations
- one default server caller story

The framework should stop making the user repeatedly decide architecture trivia.

## 21. The Design Bar

Every first-class Trellis feature must satisfy all of these:

- common across multiple real apps
- safer by construction
- simpler on the happy path
- composable with the rest of Trellis
- easy to teach

If not, it should be:

- generated instead of exposed
- moved to an advanced layer
- or deleted

Default preference order:

- delete
- simplify
- replace
- add

## 22. Product Lessons From Review

The reviews surfaced the right pressure points.

Trellis should explicitly learn from them.

### True criticisms

- surface area is large
- the boilerplate burden is too visible
- some names are confusing
- some docs drift exists
- some setup failures are too silent
- some APIs still feel more clever than necessary

### Criticisms we reject

- “Convex already makes Trellis useless”
- “opinionated stack choices are bad by default”
- “MCP coupling is inherently wrong”
- “large scope is automatically bad”

For Trellis, the real question is not “is there abstraction?”

The real question is:

**does the abstraction pay rent across many real apps?**

## 23. What Must Improve

The highest-priority product improvements are:

- remove naming collisions and obvious footguns
- make auth and actor bootstrap impossible to half-configure
- unify server auth semantics and docs
- move more repeated wiring into templates and generators
- reduce the number of concepts needed for a simple app
- keep advanced guarantees strong for multi-tenant and MCP-heavy apps

These are product improvements, not optional cleanup.

## 24. Explicit Rejections

Trellis should not become:

- a generic framework-agnostic core plus many weak adapters
- an auth-provider marketplace
- a plugin system for every architecture taste
- a second policy engine in the browser
- a doc-heavy framework that relies on convention instead of enforcement

Most importantly, Trellis should not optimize for strangers before it works excellently for repeated in-house apps.

## 25. Success Criteria

Trellis is succeeding when:

- a new CMS app can be scaffolded and running fast
- the app code feels smaller than the same app built by hand
- multi-tenant safety does not depend on remembering filters
- destructive actions do not drift between browser and MCP paths
- app number 5 feels easier than app number 2
- future-us can return after six months and still understand the architecture quickly

## 26. Canonical Near-Term Priorities

In order:

1. Fix docs drift and contradictory defaults.
2. Eliminate the known API footguns and naming collisions.
3. Make server-side auth behavior coherent.
4. Make actor bootstrap failures loud and actionable.
5. Invest hard in `trellis init ...` templates.
6. Use real apps, especially CMS-style apps, as the load-bearing truth test.

Real app pressure is the standard.

If Trellis is elegant in theory but awkward in a CMS, the framework is wrong.

## 27. Final Product Statement

The final Trellis should feel like this:

> **Trellis is the opinionated application platform for building many Nuxt + Convex apps with Better Auth, tenant-safe backend logic, and first-class MCP support.**

It is not trying to be the smallest abstraction.

It is trying to be the best repeated way to build this category of app.

That is the north star.
