# Trellis Documentation Workplan

Internal planning doc for building the Trellis docs set.

This file stays outside `docs/content/` on purpose.

- [ ] Keep planning and tracking here until a page has real content.
- [ ] Do not publish placeholder pages, TODO pages, or empty nav buckets just to reserve structure.
- [ ] Use this file as the source of truth for docs sequencing, review cadence, and page readiness.

## Current Status

- [x] `SPEC.md` removed from the repo. Use `SPEC.vNext.md` as the active design source.
- [x] Phase 1 started with the README rewrite.
- [x] README rewrite completed.
- [x] `get-started` page drafted.
- [x] `installation` page drafted.
- [ ] Next page after installation: first protected app.

## Working Rules

- [ ] Keep one primary reader and one primary job per page.
- [ ] Pick one dominant mode per page: tutorial, how-to, reference, explanation, changelog, migration, or contributing.
- [ ] Ground every page in real code, tests, examples, scripts, or shipped behavior before drafting.
- [ ] Treat `README.md`, `SPEC.vNext.md`, `examples/`, `examples-next/`, `src/`, and `test/` as source material, not as prose to copy.
- [ ] Prefer the existing docs route families already implied by the repo over inventing a second docs IA.
- [ ] Split mixed pages instead of patching them with caveats.
- [ ] Use examples as proof and teaching material, not as a substitute for written guides.
- [ ] Keep the README as the front door, not the whole house.
- [ ] Make the first success path narrow.
- [ ] Treat auth, permissions, tenancy, operations, and MCP as related but distinct reader moments.
- [ ] Use concept pages only where the mental model prevents real confusion.
- [ ] Keep terminology fixed across the set: principal, actor, guard, authorize, operation, preview, confirm, tenant isolation, tool.

## Architecture Decisions To Hold

- [ ] Keep the current top-level docs families and improve them instead of replacing them wholesale:
  - `guide`
  - `data-fetching`
  - `mutations`
  - `auth-security`
  - `file-uploads`
  - `server-side`
  - `permissions`
  - `configuration`
  - `testing`
  - `deployment`
  - `api-reference`
  - `mcp-tools`
  - `project`
- [ ] Do not add a separate top-level `concepts/` section yet.
- [ ] Treat observability as a real Trellis product surface, not as an afterthought or a logging footnote.
- [ ] Keep observability positioned as a secondary capability:
  - important for production debugging and trust
  - not the first-reader adoption hook ahead of setup, auth, permissions, and data flow
- [ ] Put concept-heavy pages where readers actually need them:
  - `guide` for the evaluator and first mental model
  - `permissions` for principal, actor, tenancy, and authorization
  - `server-side` for shared execution and bridge boundaries
  - `mcp-tools` for agent-specific concepts and safety
- [ ] Keep `12.api-reference/7.api-surface.md` generated from `scripts/generate-api-surface.mjs`.
- [ ] Keep examples discoverable from docs, but do not make docs depend on "go read example 07" as the main explanation.
- [ ] Keep future-facing or draft material clearly marked and out of setup flows.

## Source Inventory

- [x] Front door: `README.md`
- [x] North-star direction: `SPEC.vNext.md`
- [x] Canonical current examples: `examples/README.md`
- [x] Future pressure suite: `examples-next/README.md`
- [x] Docs app shell: `docs/content/index.md`, `docs/app/components/AppHeader.vue`, `docs/content.config.ts`
- [x] Generated API surface: `scripts/generate-api-surface.mjs`
- [x] Docs integrity checks: `scripts/check-doc-links.mjs`
- [x] Current public runtime surface: `src/runtime/*`, `src/cli/*`, `src/installers/*`
- [x] Contract pressure from tests: `test/unit/api-surface-doc.test.ts`, `test/unit/future-agent-conventions.test.ts`
- [ ] Existing docs debt to resolve while pages land:
  - `DEVELOPMENT.md` links to docs routes that do not exist yet

## Phase 0 - Foundations

- [ ] Confirm the docs promise in one sentence.
- [ ] Confirm the reader ladder:
  - evaluator
  - first-time builder
  - active builder
  - concept-curious builder
  - agent builder
  - contributor
  - upgrader
- [ ] Confirm the canonical first-reader path:
  - `README.md`
  - installation
  - first protected app
  - one task guide
  - reference
- [ ] Confirm the canonical example ladder:
  - `examples/01-public-todo`
  - `examples/02-auth-todo`
  - `examples/03-team-workspace`
- [ ] Confirm which example is the canonical protected-app reference.
- [ ] Confirm which example is the canonical MCP reference.
- [ ] Confirm which example is the canonical component-bridge reference.
- [ ] Confirm the terminology glossary before drafting multiple pages.
- [ ] Confirm which APIs are `stable`, `beta`, `experimental`, or `draft`.
- [ ] Decide where changelog and migration docs will live.
- [ ] Decide whether contributing docs stay at repo root, in `docs/content/docs/14.project/`, or both.
- [ ] Keep the docs route families stable before linking them from README.
- [ ] Resolve existing broken internal docs links as the real target pages land.

## Phase 1 - Front Door And First Success

- [x] Tighten `README.md` around one evaluator promise.
- [x] Remove README content that belongs in deeper guides or reference.
- [x] Keep one runnable example near the top of the README.
- [x] Keep install easy to scan in the README.
- [x] Keep the "where next" section honest and route-accurate.

- [x] Create `docs/content/docs/1.guide/1.get-started.md`
  - [x] Mode: tutorial
  - [x] Promise: get Trellis running and see one successful protected app flow
  - [x] Evidence: current install path, example app flow, actual commands
- [x] Create `docs/content/docs/1.guide/2.installation.md`
  - [x] Mode: how-to
  - [x] Promise: install the module and verify wiring
  - [x] Evidence: `pnpm add`, `nuxt.config.ts`, env expectations, `trellis doctor`
- [ ] Create `docs/content/docs/1.guide/3.first-protected-app.md`
  - [ ] Mode: tutorial
  - [ ] Promise: build a small signed-in app with one protected query and one mutation
  - [ ] Evidence: `examples/02-auth-todo`, `examples/03-team-workspace`
- [ ] Create `docs/content/docs/1.guide/4.how-it-works.md`
  - [ ] Mode: explanation
  - [ ] Promise: explain the execution pipeline without turning into API reference
  - [ ] Evidence: `README.md`, `SPEC.vNext.md`
- [ ] Create `docs/content/docs/1.guide/5.choose-the-right-example.md`
  - [ ] Mode: how-to
  - [ ] Promise: help readers choose the right example quickly
  - [ ] Evidence: `examples/README.md`, `examples-next/README.md`
- [ ] Create `docs/content/docs/1.guide/8.multi-caller-architecture.md`
  - [ ] Mode: explanation
  - [ ] Promise: explain browser, server, webhook, and agent callers sharing one backend model
  - [ ] Evidence: future-agent conventions test, MCP docs, server docs

## Phase 2 - Core Builder Tasks

- [ ] Create `docs/content/docs/2.data-fetching/1.queries.md`
  - [ ] Mode: how-to
  - [ ] Promise: fetch and render data with SSR plus live updates
- [ ] Create `docs/content/docs/2.data-fetching/2.paginated-queries.md`
  - [ ] Mode: how-to
  - [ ] Promise: paginate safely and predictably
- [ ] Create `docs/content/docs/2.data-fetching/3.cached-queries.md`
  - [ ] Mode: how-to
  - [ ] Promise: reuse already-fetched data without re-explaining query internals
- [ ] Create `docs/content/docs/2.data-fetching/4.connection-state.md`
  - [ ] Mode: reference or short how-to
  - [ ] Promise: understand pending, live, offline, and reconnect states

- [ ] Create `docs/content/docs/3.mutations/1.mutations.md`
  - [ ] Mode: how-to
  - [ ] Promise: perform mutations from Nuxt and handle pending and error states
- [ ] Create `docs/content/docs/3.mutations/2.optimistic-updates.md`
  - [ ] Mode: how-to
  - [ ] Promise: add optimistic updates without lying about rollback behavior
- [ ] Create `docs/content/docs/3.mutations/3.actions.md`
  - [ ] Mode: how-to
  - [ ] Promise: choose between mutation and action with real examples
- [ ] Create `docs/content/docs/3.mutations/4.destructive-operations.md`
  - [ ] Mode: how-to
  - [ ] Promise: build preview and confirm flows for destructive work

- [ ] Create `docs/content/docs/5.file-uploads/1.single-file-upload.md`
  - [ ] Mode: how-to
  - [ ] Promise: upload one file with progress and result handling
- [ ] Create `docs/content/docs/5.file-uploads/2.multi-file-uploads.md`
  - [ ] Mode: how-to
  - [ ] Promise: manage upload queues and concurrency
- [ ] Create `docs/content/docs/5.file-uploads/3.storage-urls.md`
  - [ ] Mode: how-to
  - [ ] Promise: display uploaded assets safely

## Phase 3 - Auth, Permissions, And Tenancy

- [ ] Create `docs/content/docs/4.auth-security/1.authentication.md`
  - [ ] Mode: how-to
  - [ ] Promise: set up auth end to end
- [ ] Create `docs/content/docs/4.auth-security/2.route-protection.md`
  - [ ] Mode: how-to
  - [ ] Promise: protect pages and avoid auth flashes
- [ ] Create `docs/content/docs/4.auth-security/3.auth-flows.md`
  - [ ] Mode: how-to
  - [ ] Promise: sign-in, sign-up, OAuth, password reset, and redirects
- [ ] Create `docs/content/docs/4.auth-security/4.auth-troubleshooting.md`
  - [ ] Mode: how-to
  - [ ] Promise: diagnose env, callback, session, and origin issues
  - [ ] Put `trellis doctor` here and in installation, not buried.

- [ ] Create `docs/content/docs/7.permissions/1.setup.md`
  - [ ] Mode: how-to
  - [ ] Promise: wire the permission system correctly
- [ ] Create `docs/content/docs/7.permissions/2.principal-and-actor.md`
  - [ ] Mode: explanation
  - [ ] Promise: explain the split and why it exists
- [ ] Create `docs/content/docs/7.permissions/3.guards.md`
  - [ ] Mode: explanation plus reference-friendly examples
  - [ ] Promise: explain coarse handler boundaries
- [ ] Create `docs/content/docs/7.permissions/4.authorization-and-can.md`
  - [ ] Mode: how-to
  - [ ] Promise: expose permission decisions in the UI without duplicating backend policy
- [ ] Create `docs/content/docs/7.permissions/5.tenant-isolation.md`
  - [ ] Mode: explanation
  - [ ] Promise: explain default scoping and why it is owned by Trellis
- [ ] Create `docs/content/docs/7.permissions/6.cross-tenant-and-raw-access.md`
  - [ ] Mode: explanation
  - [ ] Promise: explain escape hatches without normalizing them
- [ ] Create `docs/content/docs/7.permissions/7.operations.md`
  - [ ] Mode: explanation
  - [ ] Promise: explain why operations exist and when to use them
- [ ] Create `docs/content/docs/7.permissions/8.actor-lanes-and-models.md`
  - [ ] Mode: explanation
  - [ ] Promise: explain actor models, service lanes, and agent callers

## Phase 4 - Server, Testing, And Deployment

- [ ] Create `docs/content/docs/6.server-side/1.ssr-overview.md`
  - [ ] Mode: explanation
  - [ ] Promise: explain SSR, hydration, and live subscription handoff
- [ ] Create `docs/content/docs/6.server-side/2.server-routes.md`
  - [ ] Mode: how-to
  - [ ] Promise: call the same backend model from Nitro routes
- [ ] Create `docs/content/docs/6.server-side/3.webhooks-and-trusted-callers.md`
  - [ ] Mode: how-to
  - [ ] Promise: handle webhooks and trusted callers safely
- [ ] Create `docs/content/docs/6.server-side/4.hydration-and-subscriptions.md`
  - [ ] Mode: explanation
  - [ ] Promise: explain state transitions and common confusion points
- [ ] Create `docs/content/docs/6.server-side/5.private-bridge.md`
  - [ ] Mode: explanation or how-to
  - [ ] Promise: explain private bridge and stable automation surface boundaries

- [ ] Create `docs/content/docs/10.testing/1.getting-started.md`
  - [ ] Mode: how-to
  - [ ] Promise: start testing Trellis code with the supported harnesses
- [ ] Create `docs/content/docs/10.testing/2.testing-protected-handlers.md`
  - [ ] Mode: how-to
  - [ ] Promise: test protected backend logic with realistic context
- [ ] Create `docs/content/docs/10.testing/3.testing-server-and-mcp.md`
  - [ ] Mode: how-to
  - [ ] Promise: test server-side and agent-facing flows

- [ ] Create `docs/content/docs/11.deployment/1.overview.md`
  - [ ] Mode: how-to
  - [ ] Promise: explain production deployment shape and moving parts
- [ ] Create `docs/content/docs/11.deployment/2.environment-variables.md`
  - [ ] Mode: reference
  - [ ] Promise: define required env vars and where they apply
- [ ] Create `docs/content/docs/11.deployment/3.production-checklist.md`
  - [ ] Mode: checklist-style how-to
  - [ ] Promise: verify a production-ready Trellis deployment

## Phase 5 - Agent Pillar

- [ ] Create `docs/content/docs/13.mcp-tools/1.getting-started.md`
  - [ ] Mode: tutorial
  - [ ] Promise: expose one safe MCP tool end to end
- [ ] Create `docs/content/docs/13.mcp-tools/2.define-tools.md`
  - [ ] Mode: how-to
  - [ ] Promise: define tools without turning the page into runtime theory
- [ ] Create `docs/content/docs/13.mcp-tools/3.auth-and-permissions.md`
  - [ ] Mode: explanation plus how-to
  - [ ] Promise: explain agent principal handling and where real authorization still lives
- [ ] Create `docs/content/docs/13.mcp-tools/4.destructive-tools.md`
  - [ ] Mode: how-to
  - [ ] Promise: use operation-backed destructive tools with preview and confirm flows
- [ ] Create `docs/content/docs/13.mcp-tools/5.prompts-resources-sessions.md`
  - [ ] Mode: reference or focused how-to
  - [ ] Promise: document the non-tool MCP surfaces clearly

## Phase 6 - Reference And Project Hygiene

- [ ] Create `docs/content/docs/9.configuration/1.module-options.md`
  - [ ] Mode: reference
  - [ ] Promise: document root module options precisely
- [ ] Create `docs/content/docs/9.configuration/2.auth-options.md`
  - [ ] Mode: reference
  - [ ] Promise: document auth-specific configuration
- [ ] Create `docs/content/docs/9.configuration/3.permissions-options.md`
  - [ ] Mode: reference
  - [ ] Promise: document permissions-specific configuration
- [ ] Create `docs/content/docs/9.configuration/4.mcp-options.md`
  - [ ] Mode: reference
  - [ ] Promise: document MCP-specific configuration

- [ ] Create `docs/content/docs/12.api-reference/1.composables.md`
  - [ ] Mode: reference
  - [ ] Promise: document runtime composables by user-facing domain
- [ ] Create `docs/content/docs/12.api-reference/2.components.md`
  - [ ] Mode: reference
  - [ ] Promise: document runtime components and when to use them
- [ ] Create `docs/content/docs/12.api-reference/3.functions.md`
  - [ ] Mode: reference
  - [ ] Promise: document `defineTrellis`, builders, `ctx`, and operations
- [ ] Create `docs/content/docs/12.api-reference/4.server.md`
  - [ ] Mode: reference
  - [ ] Promise: document server helpers and trusted caller helpers
- [ ] Create `docs/content/docs/12.api-reference/5.mcp.md`
  - [ ] Mode: reference
  - [ ] Promise: document MCP runtime APIs and root internal refs
- [ ] Create `docs/content/docs/12.api-reference/6.testing.md`
  - [ ] Mode: reference
  - [ ] Promise: document testing helpers
- [ ] Generate `docs/content/docs/12.api-reference/7.api-surface.md`
  - [ ] Run `pnpm docs:api-surface`
  - [ ] Verify route and test expectations

- [ ] Create `docs/content/docs/8.observability/1.overview.md`
  - [ ] Mode: explanation
  - [ ] Promise: explain observability as semantic decisions, not log noise
  - [ ] Evidence: `src/runtime/utils/observability/*`, `test/unit/observability.test.ts`, `SPEC.vNext.md`
- [ ] Create `docs/content/docs/8.observability/2.semantic-events.md`
  - [ ] Mode: reference
  - [ ] Promise: document event families and meanings
  - [ ] Evidence: `src/runtime/utils/observability/types.ts`
- [ ] Create `docs/content/docs/8.observability/3.debugging-decisions.md`
  - [ ] Mode: how-to
  - [ ] Promise: help readers debug real authorization and execution issues
  - [ ] Evidence: runtime config, server correlation handling, MCP denial explanations

- [ ] Create `docs/content/docs/14.project/1.examples.md`
  - [ ] Mode: guide
  - [ ] Promise: map examples to problems and reader stages
- [ ] Create `docs/content/docs/14.project/2.contributing.md`
  - [ ] Mode: contributing
  - [ ] Promise: welcome contributors and tell them how to work on docs and code
- [ ] Create `docs/content/docs/14.project/3.changelog.md`
  - [ ] Mode: changelog
  - [ ] Promise: track user-facing changes, not internal commit noise
- [ ] Create `docs/content/docs/14.project/4.migration-guides.md`
  - [ ] Mode: migration
  - [ ] Promise: provide a home for real upgrade guidance when breaking changes land

## Per-Page Production Checklist

Copy this checklist when starting any page.

- [ ] Name the primary reader.
- [ ] Write the page promise as one sentence.
- [ ] Confirm the dominant mode.
- [ ] List the exact source files, tests, examples, and commands used to verify the page.
- [ ] Confirm whether the page is current-state docs or explicitly future-facing docs.
- [ ] Check whether the page belongs in README, guide, how-to, explanation, or reference instead.
- [ ] Collect one minimal truthful example.
- [ ] Collect one visible success state or expected output if the page is procedural.
- [ ] Collect the likely failure modes worth documenting.
- [ ] Draft the opening paragraph so the reader can tell they are in the right place.
- [ ] Make headings informative enough to scan without reading the full page.
- [ ] Remove any section that does not support the page promise.
- [ ] Check every code block for hidden setup.
- [ ] Check every claim for invented defaults, behavior, or limits.
- [ ] Check terminology consistency against the glossary.
- [ ] Link to the next useful page.
- [ ] Run the page against the `Stop-Ship` and page-type checklist from the doc-writing skill.

## Batch Review Cadence

Do not wait until the whole site is drafted.

- [ ] Review after every 3 to 5 finished pages.
- [ ] Review after each phase.
- [ ] Review immediately after landing a new concept page that changes terminology.
- [ ] Review immediately after rewriting README or the first-success tutorial.

### Batch Review Checklist

- [ ] Read only page titles, headings, and first sentences across the batch.
- [ ] Check for duplicated explanation across guides.
- [ ] Check for concept drift in key terms.
- [ ] Check whether two pages are really one page or one bloated page should become two.
- [ ] Check that task pages start with the task, not product philosophy.
- [ ] Check that explanation pages do not quietly turn into step lists.
- [ ] Check that reference pages stay neutral and predictable.
- [ ] Check that examples are not doing the teaching work alone.
- [ ] Check that examples, docs, and tests agree on the current behavior.
- [ ] Check that README links still point to real pages.
- [ ] Check that no guide depends on a missing reference page for basic comprehension.
- [ ] Check whether a concept deserves promotion to its own page or demotion back into a guide.

## Technical Review Checklist

- [ ] Preview the docs app with `pnpm --dir docs dev`.
- [ ] Verify that every linked docs route exists.
- [ ] Run `pnpm check:docs:links`.
- [ ] Run `pnpm docs:api-surface` after API-surface-affecting changes.
- [ ] Run `pnpm check:docs:api-surface` if the generated page should not change.
- [ ] Run `pnpm lint` if docs paths or docs assertions are part of the touched surface.
- [ ] Re-check any page named in docs-related tests.
- [ ] Verify navigation labels and landing-page links after adding new sections.

## Stop-Ship For The Whole Docs Set

- [ ] A first-time reader can go from README to a working Trellis app without reading the spec.
- [ ] An active builder can solve common app tasks without reading source code first.
- [ ] A concept-curious reader can understand principal, actor, guard, tenancy, and operations without hunting across unrelated pages.
- [ ] An agent builder can expose a safe tool without mixing browser and MCP setup on the same page.
- [ ] A contributor can find where docs live, how to preview them, and when code changes require doc changes.
- [ ] A skeptical reader would see honest boundaries between stable and draft surface area.
- [ ] No public page is a placeholder.
- [ ] No public page mixes tutorial, guide, explanation, and reference badly enough to confuse the reader.
- [ ] All README and docs internal links resolve.

## Deferred Until Needed

- [ ] Separate top-level `concepts/` section.
- [ ] Public FAQ page.
- [ ] Massive single-page composables reference dump.
- [ ] Public roadmap page unless it clearly distinguishes shipped, experimental, and draft.
- [ ] Migration pages before there is a real breaking-change boundary.

## Next Writing Order

- [ ] 1. Tighten `README.md`
- [ ] 2. Write installation
- [ ] 3. Write first protected app
- [ ] 4. Write authentication
- [ ] 5. Write permissions setup
- [ ] 6. Write queries
- [ ] 7. Write module options
- [ ] 8. Generate API surface
- [ ] 9. Run first batch review
- [ ] 10. Write observability overview once auth, permissions, and operations terminology is stable
- [ ] 11. Continue into server-side and MCP docs
