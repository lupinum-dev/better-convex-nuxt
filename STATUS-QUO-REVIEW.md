# Status Quo Review Against `SPEC-FINAL.md`

This file tracks where Trellis currently stands against the target described in [SPEC-FINAL.md](/Users/matthias/Git/0_libs/WORK/trellis/SPEC-FINAL.md).

It is intentionally execution-oriented:

- `[x]` means the repo already meets the intent well enough
- `[ ]` means there is still real product delta
- items can be split further later if needed

This is not a theory document.
This is the working gap tracker.

---

## Snapshot

Current Trellis is already strong on:

- protected backend structure
- tenant isolation
- explicit trust escape hatches
- operation-backed destructive flows
- MCP projection over the same backend model
- a useful `doctor` command
- feature scaffolding for auth, permissions, and MCP

Current Trellis is still weak on:

- app-first scaffolding
- template/archetype productization
- docs consistency
- auth/server default coherence
- some API naming and footguns
- loud failure modes for partial setup

The highest-level truth is:

**Trellis already has a strong engine, but it is not yet a fully productized app platform.**

---

## 1. Product Positioning

- [x] Trellis is already one opinionated package centered on `Nuxt + Convex + Better Auth + MCP`.
  Current evidence: [README.md](/Users/matthias/Git/0_libs/WORK/trellis/README.md), [package.json](/Users/matthias/Git/0_libs/WORK/trellis/package.json)
- [x] The repo already behaves more like an application framework than a narrow utility library.
  Current evidence: `src/runtime`, `src/cli`, `docs`, `examples`, `examples-next`
- [ ] Top-level docs consistently frame Trellis as an internal app platform for repeated apps, not as a generic “progressive layer” for all audiences.
  Current evidence of mismatch: [README.md](/Users/matthias/Git/0_libs/WORK/trellis/README.md), [docs/content/docs/01.getting-started/1.start-here.md](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/01.getting-started/1.start-here.md)

## 2. Core Runtime Model

- [x] Protected handler structure exists: principal, actor, guard, load, authorize, handler.
  Current evidence: [src/runtime/functions/define-handler.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/functions/define-handler.ts)
- [x] Tenant isolation exists and is runtime-enforced on `ctx.db`.
  Current evidence: [src/runtime/functions/index.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/functions/index.ts), [docs/content/docs/08.permissions/5.tenant-isolation.md](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/08.permissions/5.tenant-isolation.md)
- [x] Explicit escape hatches exist: `ctx.db.crossTenant` and `ctx.db.raw`.
  Current evidence: [docs/content/docs/08.permissions/6.cross-tenant-and-raw-access.md](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/08.permissions/6.cross-tenant-and-raw-access.md)
- [x] Operation-backed destructive flows exist with confirmation semantics.
  Current evidence: [src/runtime/functions/define-operation.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/functions/define-operation.ts), [src/runtime/functions/index.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/functions/index.ts)
- [x] MCP tools can project the same backend action model.
  Current evidence: [src/runtime/mcp](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/mcp), [examples/07-mcp-reference](/Users/matthias/Git/0_libs/WORK/trellis/examples/07-mcp-reference)
- [ ] The runtime model is simple enough that a basic app does not need to absorb too much vocabulary on day 1.
  Current evidence of gap: [docs/content/docs/02.concepts/2.glossary.md](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/02.concepts/2.glossary.md)

## 3. Identity and Trust Boundaries

- [x] Principal and actor are modeled separately.
  Current evidence: [docs/content/docs/08.permissions/2.principal-and-actor.md](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/08.permissions/2.principal-and-actor.md)
- [x] Trusted caller support exists for server-to-server flows.
  Current evidence: [src/runtime/server/utils/convex.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/server/utils/convex.ts), [docs/content/docs/07.server-side/3.webhooks-and-trusted-callers.md](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/07.server-side/3.webhooks-and-trusted-callers.md)
- [ ] Forwarded principal handling is clearly constrained to trusted paths and hard to misuse.
  Current evidence of gap: [src/cli/lib/init.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/cli/lib/init.ts), workspace principal scaffolds
- [ ] Actor bootstrap failures are loud, actionable, and treated as first-class setup errors.
  Current evidence of gap: missing `triggersApi()` still yields “sign-in works, actor is null” behavior described in [docs/content/docs/01.getting-started/4.build-a-signed-in-todo-app.md](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/01.getting-started/4.build-a-signed-in-todo-app.md)

## 4. CLI and Scaffolding

- [x] `trellis doctor` exists and is already a useful part of the product.
  Current evidence: [src/cli/commands/doctor.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/cli/commands/doctor.ts)
- [x] `trellis init auth`, `trellis init permissions`, and `trellis init mcp` exist.
  Current evidence: [src/cli/main.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/cli/main.ts), [src/cli/commands/init.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/cli/commands/init.ts)
- [x] Permission scaffolds already support `personal`, `workspace`, and `workspace-mcp` models.
  Current evidence: [src/cli/lib/init.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/cli/lib/init.ts)
- [ ] Trellis has a real app bootstrap flow like `trellis init <app> --template=<archetype>`.
- [ ] Trellis ships app archetype templates as product surfaces, not just examples.
- [ ] Generated apps come out coherent enough that the user does not hand-wire auth, actor, and permission plumbing by default.
- [ ] The CLI owns more of the repetitive setup burden than the runtime/docs currently do.

## 5. App Archetypes and Templates

- [x] The repo already contains strong example pressure from multiple app shapes.
  Current evidence: [examples](/Users/matthias/Git/0_libs/WORK/trellis/examples), [examples-next](/Users/matthias/Git/0_libs/WORK/trellis/examples-next)
- [x] There is already an embryonic CMS reference via component mini CMS and docs/wiki style examples.
  Current evidence: [examples/08-component-mini-cms](/Users/matthias/Git/0_libs/WORK/trellis/examples/08-component-mini-cms), [examples-next/03-docs-wiki](/Users/matthias/Git/0_libs/WORK/trellis/examples-next/03-docs-wiki), [examples-next/05-headless-cms-publishing](/Users/matthias/Git/0_libs/WORK/trellis/examples-next/05-headless-cms-publishing)
- [ ] `personal`, `workspace`, `cms`, `support-inbox`, `admin-console`, and `agent-console` exist as official CLI archetypes.
- [ ] The repo clearly distinguishes “examples for learning” from “templates for shipping”.
- [ ] A CMS archetype exists as a first-class Trellis product lane rather than a scattered combination of examples.

## 6. Canonical App Shape

- [ ] Trellis has one documented and generated canonical app file layout.
- [ ] Auth, domain, permissions, operations, and shared schemas are consistently scaffolded into fixed locations.
- [ ] New apps feel structurally identical enough that moving between apps is nearly frictionless.

Notes:

- Current examples are similar, but not strict enough to count as one canonical app shape yet.
- This is a productization gap, not a missing-runtime gap.

## 7. Nuxt Integration

- [x] Trellis already delivers strong Nuxt-side value: SSR queries, live handoff, auth composables, uploads, server helpers.
  Current evidence: `src/runtime/composables`, `src/runtime/server`, `src/runtime/plugin.*`
- [x] Route protection exists.
  Current evidence: [src/runtime/middleware/convex-auth.global.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/middleware/convex-auth.global.ts)
- [ ] Nuxt-side naming and control surfaces are coherent enough to avoid obvious confusion.
  Current evidence of gap: `skipAuthRoutes` vs `skipConvexAuth`, server auth default confusion

## 8. API Ergonomics and Naming

- [ ] Backend `can(...)` and frontend `usePermissions().can(...)` should no longer share the same name.
  Current evidence of gap: [docs/content/docs/08.permissions/4.authorization-and-can.md](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/08.permissions/4.authorization-and-can.md)
- [ ] `authenticated` should stop being a surprising special-case sentinel or be replaced by a clearer model.
  Current evidence of gap: [src/runtime/auth/define-guard.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/auth/define-guard.ts)
- [ ] `skipAuthRoutes` and `skipConvexAuth` should be renamed or redesigned to remove the current naming trap.
- [ ] `useConvexMutation` should be harder to misuse, either via naming, API design, or stronger lint/runtime guidance.
  Current evidence of gap: [docs/content/docs/04.mutations/1.mutations.md](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/04.mutations/1.mutations.md)
- [ ] `useCachedQuery` should avoid silent confusion on arg mismatches or expose a clearer failure/debug story.
  Current evidence of gap: [docs/content/docs/03.data-fetching/3.cached-queries.md](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/03.data-fetching/3.cached-queries.md)

## 9. Docs and Product Coherence

- [ ] Auth defaults are described consistently everywhere.
  Known mismatch: [src/module.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/module.ts), [docs/content/docs/01.getting-started/2.installation.md](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/01.getting-started/2.installation.md), [docs/content/docs/10.configuration/3.auth-options.md](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/10.configuration/3.auth-options.md)
- [ ] Server helper auth defaults are described consistently everywhere.
  Known mismatch: [docs/content/docs/07.server-side/2.server-routes.md](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/07.server-side/2.server-routes.md), [docs/content/docs/13.api-reference/4.server.md](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/13.api-reference/4.server.md), [src/runtime/server/index.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/server/index.ts)
- [ ] The docs consistently tell the same product story as `SPEC-FINAL.md`.
- [ ] Advanced concepts are progressively disclosed instead of appearing equally “core” to every app.

## 10. Failure Modes and Safety

- [x] Trellis already has real safety guarantees around tenant isolation and destructive MCP execution.
- [x] Observability exists around trust-boundary events.
  Current evidence: [docs/content/docs/09.observability](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/09.observability)
- [ ] Partial setup failures are turned into loud product errors more consistently.
  Examples: missing actor bootstrap wiring, missing sync triggers, misused forwarded principal paths
- [ ] The runtime avoids leaking internal transport metadata into user-level validated args.
  Current evidence of gap: server mutation/action observation envelope behavior in [src/runtime/server/utils/convex.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/server/utils/convex.ts)

## 11. Real App Pressure

- [ ] A real Trellis-built app is treated as the load-bearing truth test for product ergonomics.
- [ ] `ginko-cms` or an equivalent CMS app is used to drive Trellis design decisions.
- [ ] Repeated pain from real app construction is fed back into templates, CLI, and runtime cleanup.

This is important enough to state plainly:

**Without a real app exercising Trellis continuously, Trellis will drift toward architectural elegance instead of product usefulness.**

## 12. Immediate Execution Backlog

These are the highest-value unchecked items right now.

- [ ] Fix auth default docs drift.
- [ ] Fix server helper auth docs drift.
- [ ] Decide and implement the app-first CLI entrypoint shape.
- [ ] Define the first official archetypes and which examples graduate into them.
- [ ] Make actor bootstrap and missing user-sync wiring fail loudly.
- [ ] Resolve the biggest API naming traps.
- [ ] Document one canonical Trellis app layout.
- [ ] Pick `ginko-cms` as the first load-bearing app and feed the paper cuts back into Trellis.

## 13. Done Means

This tracker is complete when:

- Trellis can bootstrap real apps from archetypes, not just scaffold isolated features
- the docs, defaults, and runtime tell one coherent story
- the footguns that keep coming up in review are either gone or explicitly contained
- a real CMS app validates that the platform is cheaper than wiring the stack by hand

Until then, `SPEC-FINAL.md` is the target and this file is the delta.
