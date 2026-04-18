# Status Quo Review Against `SPEC-FINAL.md`

This file tracks where Trellis currently stands against the target described in [SPEC-FINAL.md](/Users/matthias/Git/0_libs/WORK/trellis/SPEC-FINAL.md).

It is intentionally execution-oriented:

- `[x]` means the repo already meets the intent well enough
- `[ ]` means there is still real product delta
- items can be split further later if needed

This is not a theory document.
This is the working gap tracker.

## Active Execution Order

- [x] P0.1 Create a canonical status-quo gap tracker.
- [x] P0.2 Fix auth default docs drift.
- [x] P0.3 Fix server helper auth semantics and docs drift.
- [x] P0.4 Stop leaking internal transport metadata into validated mutation/action args.
- [x] P1.1 Decide the app-first CLI entrypoint shape.
- [x] P1.2 Define the first official archetypes and template graduation path.
- [x] P1.3 Make actor bootstrap and missing sync wiring fail loudly.
- [x] P1.4 Resolve the biggest naming traps.
- [x] P1.5 Document one canonical Trellis app layout.
- [x] P2.1 Put a real Trellis-built CMS on the critical path and feed back the paper cuts.

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
- some API naming and footguns
- broader cross-app consistency after the first archetypes

The highest-level truth is:

**Trellis already has a strong engine, but it is not yet a fully productized app platform.**

---

## 1. Product Positioning

- [x] Trellis is already one opinionated package centered on `Nuxt + Convex + Better Auth + MCP`.
  Current evidence: [README.md](/Users/matthias/Git/0_libs/WORK/trellis/README.md), [package.json](/Users/matthias/Git/0_libs/WORK/trellis/package.json)
- [x] The repo already behaves more like an application framework than a narrow utility library.
  Current evidence: `src/runtime`, `src/cli`, `docs`, `examples`, `examples-next`
- [x] Top-level docs consistently frame Trellis as an internal app platform for repeated apps, not as a generic “progressive layer” for all audiences.
  Current evidence: [README.md](/Users/matthias/Git/0_libs/WORK/trellis/README.md), [docs/content/docs/01.getting-started/1.start-here.md](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/01.getting-started/1.start-here.md), [docs/content/docs/01.getting-started/2.installation.md](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/01.getting-started/2.installation.md)

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
- [x] Forwarded principal handling is clearly constrained to trusted paths and hard to misuse.
  Current evidence: [src/runtime/functions/index.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/functions/index.ts), [src/runtime/server/index.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/server/index.ts), [src/cli/lib/init.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/cli/lib/init.ts)
- [x] Actor bootstrap failures are loud, actionable, and treated as first-class setup errors.
  Current evidence: [src/runtime/auth/define-actor.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/auth/define-actor.ts), [src/runtime/composables/configured-permissions.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/composables/configured-permissions.ts), [docs/content/docs/01.getting-started/4.build-a-signed-in-todo-app.md](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/01.getting-started/4.build-a-signed-in-todo-app.md)

## 4. CLI and Scaffolding

- [x] `trellis doctor` exists and is already a useful part of the product.
  Current evidence: [src/cli/commands/doctor.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/cli/commands/doctor.ts)
- [x] `trellis init auth`, `trellis init permissions`, and `trellis init mcp` exist.
  Current evidence: [src/cli/main.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/cli/main.ts), [src/cli/commands/init.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/cli/commands/init.ts)
- [x] Permission scaffolds already support `personal`, `workspace`, and `workspace-mcp` models.
  Current evidence: [src/cli/lib/init.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/cli/lib/init.ts)
- [x] Trellis has a real app bootstrap flow via `trellis init app --template=<starter>`.
  Current evidence: [src/cli/commands/init.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/cli/commands/init.ts), [src/cli/lib/init.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/cli/lib/init.ts), [test/unit/cli-doctor.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/test/unit/cli-doctor.test.ts)
- [x] Trellis ships app archetype templates as product surfaces, not just examples.
- [x] Generated starter apps now come out coherent enough that the user does not hand-wire auth, actor, and permission plumbing for the `personal`, `workspace`, and `workspace-mcp` starters.
  Current evidence: [src/cli/lib/init.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/cli/lib/init.ts), [test/unit/cli-doctor.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/test/unit/cli-doctor.test.ts)
- [ ] The CLI owns more of the repetitive setup burden than the runtime/docs currently do.

## 5. App Archetypes and Templates

- [x] The repo already contains strong example pressure from multiple app shapes.
  Current evidence: [examples](/Users/matthias/Git/0_libs/WORK/trellis/examples), [examples-next](/Users/matthias/Git/0_libs/WORK/trellis/examples-next)
- [x] There is already an embryonic CMS reference via component mini CMS and docs/wiki style examples.
  Current evidence: [examples/08-component-mini-cms](/Users/matthias/Git/0_libs/WORK/trellis/examples/08-component-mini-cms), [examples-next/03-docs-wiki](/Users/matthias/Git/0_libs/WORK/trellis/examples-next/03-docs-wiki), [examples-next/05-headless-cms-publishing](/Users/matthias/Git/0_libs/WORK/trellis/examples-next/05-headless-cms-publishing)
- [ ] `personal`, `workspace`, `cms`, `support-inbox`, `admin-console`, and `agent-console` exist as official CLI archetypes.
- [x] The repo clearly distinguishes “examples for learning” from “templates for shipping”.
  Current evidence: [README.md](/Users/matthias/Git/0_libs/WORK/trellis/README.md), [examples/README.md](/Users/matthias/Git/0_libs/WORK/trellis/examples/README.md), [examples-next/README.md](/Users/matthias/Git/0_libs/WORK/trellis/examples-next/README.md)
- [x] A CMS archetype exists as a first-class Trellis product lane rather than a scattered combination of examples.
  Current evidence: [src/cli/lib/init.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/cli/lib/init.ts), [docs/content/docs/01.getting-started/5.canonical-app-layout.md](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/01.getting-started/5.canonical-app-layout.md)

## 6. Canonical App Shape

- [x] Trellis has one documented and generated canonical app file layout.
  Current evidence: [docs/content/docs/01.getting-started/5.canonical-app-layout.md](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/01.getting-started/5.canonical-app-layout.md), [src/cli/lib/init.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/cli/lib/init.ts)
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
- [x] Nuxt-side naming and control surfaces are coherent enough to avoid obvious confusion.
  Current evidence: server auth defaults were aligned earlier, and auth token fetch controls now use `skipAuthTokenFetchRoutes` / `skipAuthTokenFetch`.

## 8. API Ergonomics and Naming

- [x] Backend `can(...)` and frontend `usePermissions().can(...)` no longer share the same name.
  Current evidence: frontend projection now uses `allows(...)` in [src/runtime/composables/configured-permissions.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/composables/configured-permissions.ts) and the matching docs/examples.
- [x] `authenticated` stopped being a vague special-case sentinel and is now the explicit `authRequired` principal gate.
  Current evidence: [src/runtime/auth/define-guard.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/auth/define-guard.ts), [docs/content/docs/08.permissions/3.guards.md](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/08.permissions/3.guards.md)
- [x] `skipAuthRoutes` and `skipConvexAuth` were renamed to remove the naming trap.
  Current evidence: [src/module-internals/options.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/module-internals/options.ts), [src/runtime/middleware/convex-auth.global.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/middleware/convex-auth.global.ts)
- [x] `useConvexMutation` docs and tooling match the real runtime behavior instead of warning about a non-existent `await useConvexMutation(...)` footgun.
  Current evidence: [docs/content/docs/04.mutations/1.mutations.md](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/04.mutations/1.mutations.md), [src/eslint/index.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/eslint/index.ts), [test/nuxt/useConvexMutation.nuxt.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/test/nuxt/useConvexMutation.nuxt.test.ts)
- [x] `useCachedQuery` now exposes a clearer cache-seed debug story and warns when cached source data exists but the seed matcher misses.
  Current evidence: [src/runtime/composables/useCachedQuery.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/composables/useCachedQuery.ts), [docs/content/docs/03.data-fetching/3.cached-queries.md](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/03.data-fetching/3.cached-queries.md), [test/nuxt/useCachedQuery.nuxt.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/test/nuxt/useCachedQuery.nuxt.test.ts)

## 9. Docs and Product Coherence

- [x] Auth defaults are described consistently everywhere.
  Known mismatch: [src/module.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/module.ts), [docs/content/docs/01.getting-started/2.installation.md](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/01.getting-started/2.installation.md), [docs/content/docs/10.configuration/3.auth-options.md](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/10.configuration/3.auth-options.md)
- [x] Server helper auth defaults are described consistently everywhere.
  Known mismatch: [docs/content/docs/07.server-side/2.server-routes.md](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/07.server-side/2.server-routes.md), [docs/content/docs/13.api-reference/4.server.md](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/13.api-reference/4.server.md), [src/runtime/server/index.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/server/index.ts)
- [ ] The docs consistently tell the same product story as `SPEC-FINAL.md`.
- [ ] Advanced concepts are progressively disclosed instead of appearing equally “core” to every app.

## 10. Failure Modes and Safety

- [x] Trellis already has real safety guarantees around tenant isolation and destructive MCP execution.
- [x] Observability exists around trust-boundary events.
  Current evidence: [docs/content/docs/09.observability](/Users/matthias/Git/0_libs/WORK/trellis/docs/content/docs/09.observability)
- [ ] Partial setup failures are turned into loud product errors more consistently.
  Examples: missing actor bootstrap wiring, missing sync triggers, misused forwarded principal paths
- [x] The runtime avoids leaking internal transport metadata into user-level validated args.
  Current evidence of gap: server mutation/action observation envelope behavior in [src/runtime/server/utils/convex.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/server/utils/convex.ts)

## 11. Real App Pressure

- [x] A real Trellis-built app is treated as the load-bearing truth test for product ergonomics.
- [x] `ginko-cms` or an equivalent CMS app is used to drive Trellis design decisions.
- [x] Repeated pain from real app construction is fed back into templates, CLI, and runtime cleanup.

Current concrete findings from `ginko-cms`:

- The sharpest integration seam is the Convex host boundary. `ginko-cms` currently depends on generated bridge files plus manually owned `convex/convex.config.ts`, `convex/auth.ts`, and `convex/http.ts`, which is brittle and easy to break during upgrades.
- The highest-value Trellis response was not more generic plumbing. It was productizing a first-class `cms` starter and making Nuxt module bridge installation declarative so Trellis owns the host parity checks instead of each consumer.
- Both halves of that response now exist:
  - Trellis has an official `cms` starter.
  - `bridge generate` now supports manifest-managed edits for host-owned files, and `ginko-cms` uses that contract for `convex/convex.config.ts`.

This is important enough to state plainly:

**Without a real app exercising Trellis continuously, Trellis will drift toward architectural elegance instead of product usefulness.**

## 12. Immediate Execution Backlog

These are the highest-value unchecked items right now.

- [x] Fix auth default docs drift.
- [x] Fix server helper auth docs drift.
- [x] Decide and implement the app-first CLI entrypoint shape.
- [x] Define the first official archetypes and which examples graduate into them.
- [x] Make actor bootstrap and missing user-sync wiring fail loudly.
- [x] Resolve the biggest API naming traps.
- [x] Document one canonical Trellis app layout.
- [x] Pick `ginko-cms` as the first load-bearing app and feed the paper cuts back into Trellis.

## 14. Recent Completions

- [x] Aligned auth shorthand normalization with the module default auth-enabled path.
- [x] Updated auth option docs to describe the current auth-enabled default honestly.
- [x] Changed `createServerConvexCaller(...)` to accept and forward the same auth options as the per-call server helpers, defaulting to `auth: 'auto'`.
- [x] Updated server-side docs to match the real caller semantics.
- [x] Removed server-side `__trellis` arg injection for mutations and actions so non-Trellis handlers do not fail strict argument validation.
- [x] Added focused unit coverage for the new server caller semantics and the no-metadata-leak contract.
- [x] Added an app-first CLI bootstrap path: `trellis init app --template personal|workspace|workspace-mcp`.
- [x] Added starter app coverage for personal, workspace, and workspace+MCP bootstrap flows.
- [x] Added a dedicated getting-started page for the canonical generated Trellis app layout and linked it from the main onboarding flow.
- [x] Changed generated personal and workspace actor scaffolds to fail with an explicit setup error when auth resolves but the mirrored `users` row is missing.
- [x] Hard-cut the lower-level actor helper surface so authenticated callers without a Trellis `users` row now fail with the same setup error instead of resolving `null`.
- [x] Taught configured permission queries to wait for `auth:createUserIfNeeded` when bootstrap is configured, so auth-ready apps do not trip the new loud actor contract during initial sign-in.
- [x] Defined the current official starters versus learning examples versus future archetype candidates, including a template graduation path.
- [x] Hard-cut the biggest naming traps: frontend permission projection now uses `allows(...)`, the pre-actor auth gate is `authRequired`, and auth token fetch skip controls now use `skipAuthTokenFetch...`.
- [x] Added an official `cms` starter to `trellis init app`, covering public published-page reads plus a signed-in studio with draft/save/publish flow.
- [x] Updated the onboarding docs so `cms` is treated as a real lane, not only as a future candidate in `examples-next`.
- [x] Extended component-bridge manifests to manage host-owned file edits in addition to generated bridge files.
- [x] Moved `ginko-cms` off manual Convex component registration checks and onto a manifest-managed `convex/convex.config.ts` block validated through the same bridge contract.
- [x] Hard-cut the top-level docs away from the old “generic connective layer” pitch and aligned `README`, `start-here`, and `installation` with the app-platform story in `SPEC-FINAL.md`.
- [x] Simplified the day-1 onboarding guides so `start-here`, `first-live-query`, and `build-a-signed-in-todo-app` explain the public and personal lanes in app terms first, deferring heavier Trellis vocabulary to the concepts section.
- [x] Updated the concepts page to point at `SPEC-FINAL.md` instead of the superseded `SPEC.vNext.md`.
- [x] Reframed the concepts and guides section entry pages so they explicitly describe concepts, permissions, server-side, and MCP as deeper lanes instead of implying every section is part of the same day-1 path.
- [x] Added “read this when / skip this for now” framing to the permissions deep-dive entry pages (`setup`, `principal-and-actor`, `guards`, `operations`) so they behave like opt-in layers instead of mandatory onboarding.
- [x] Fixed the remaining docs vocabulary drift where the glossary still described frontend permission projection in terms of `can(...)` instead of `allows(...)`.
- [x] Removed the false `await useConvexMutation(...)` warning path from docs and ESLint after verifying the composable returns the same callable when awaited.
- [x] Added `cacheStatus` to `useCachedQuery` and a targeted warning for the suspicious "source cache exists but the matcher missed" case.
- [x] Taught root protected functions to accept trusted-caller transport fields and attach verified trusted-caller identity into the runtime context before principal/actor resolution.
- [x] Hard-cut forwarded principal handling so the request-scoped server caller only allows `principal` on `auth: 'trusted'` calls with `actor`, and the generated workspace/MCP starters now enforce the same trusted-path rule.

## 13. Done Means

This tracker is complete when:

- Trellis can bootstrap real apps from archetypes, not just scaffold isolated features
- the docs, defaults, and runtime tell one coherent story
- the footguns that keep coming up in review are either gone or explicitly contained
- a real CMS app validates that the platform is cheaper than wiring the stack by hand

Until then, `SPEC-FINAL.md` is the target and this file is the delta.
