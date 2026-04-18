# Trellis Docs Execution Tracker

Internal checklist for the reading-experience refactor.

## Nav Reset

- [x] Top nav reduced to `Get Started`, `Guides`, `Concepts`, `Reference`, `Examples`, `Project`.
- [x] Landing page CTAs match the same six-bucket story.
- [x] Advanced surfaces removed from main nav and homepage feature cards.

## Page Inventory

- [x] `keep`: data fetching, mutations, auth, permissions, uploads, core server-side guides, API-reference hubs, examples
- [x] `merge`: `How It Works` absorbed the useful content from `Multi-Caller Architecture`
- [x] `split`: old quickstart replaced by `First Live Query` and `Build a Signed-In Todo App`
- [x] `demote`: component bridge, advanced caller models, prompts/resources/sessions, observability, deployment, testing, config deep dives
- [x] `hide`: migration guides kept published but removed from public navigation until real migration content exists

## Route Cutovers

- [x] `/docs/getting-started/first-live-query`
- [x] `/docs/getting-started/build-a-signed-in-todo-app`
- [x] `/docs/examples`
- [x] `/docs/guides`
- [x] `/docs/reference`
- [x] `/docs/project`
- [x] `/docs/concepts/how-it-works` is the only worldview page

## Sample Contract Audit

- [x] Homepage permissions snippet uses `usePermissions().allows(key)` instead of a demo-style resource arg
- [x] Examples page states `examples/` is the canonical public example set
- [x] `examples-next/` is labeled as future-direction pressure, not public source of truth
- [x] Docs check fails on known demo-only public-docs patterns

## Editorial Pass

- [x] First-success path rewritten around smaller emotional wins
- [x] Bucket landing pages added for `Get Started`, `Guides`, `Concepts`, `Reference`, and `Project`
- [x] Repeated worldview links pointed back to `How It Works`

The remaining editorial TODOs (`Use this page when...` openings; `Common mistakes` / `Next step` heading normalization) are absorbed into the Reading-Experience Rewrite waves below.

## Reading-Experience Rewrite (active)

Sweeping rewrite of all ~60 docs pages to fix density, robotic prose, jargon without anchors, and missing visual components. Warmer Vercel/Nuxt-style voice. Wave-based rollout so each wave is independently shippable.

Full plan: `~/.claude/plans/we-not-happy-with-effervescent-cray.md`

### Wave 0 — Foundation

- [x] `docs/STYLE.md` — authoring style guide (voice, headings, MDC component playbook, code-block conventions, jargon rules).
- [x] `docs/content/docs/2.concepts/2.glossary.md` — canonical term definitions with stable anchors (principal, actor, guard, check, operation, tenant, projection, transport, App/Nuxt/Agent Runtime, business layer).
- [ ] `pnpm check:docs:links`, `pnpm check:docs:api-surface`, `pnpm --dir docs build` all green with Wave 0 changes.

### Wave 1 — First-read path

- [ ] Wire Mermaid rendering in Nuxt Content (prerequisite for diagrams on `how-it-works.md`).
- [ ] Rewrite `1.getting-started.md` (hub).
- [ ] Rewrite `1.getting-started/1.start-here.md`.
- [ ] Rewrite `1.getting-started/2.installation.md`.
- [ ] Rewrite `1.getting-started/3.first-live-query.md` — convert Steps 1-4 to `::steps`, add filename meta to every code block.
- [ ] Rewrite `1.getting-started/4.build-a-signed-in-todo-app.md`.
- [ ] Rewrite `2.concepts.md` + `2.concepts/1.how-it-works.md` — add three Mermaid diagrams (caller-type fan-in, principal→actor→guard sequence, three pillars), break up bullet walls, anchor vocabulary via glossary links.

### Wave 2 — Core guides

- [ ] `3.data-fetching/*` (queries.md gets the optional SSR-hydrate-subscribe diagram).
- [ ] `4.mutations/*`.
- [ ] `5.auth-security/*`.
- [ ] `6.file-uploads/*`.
- [ ] `7.server-side/*`.

### Wave 3 — Advanced + reference

- [ ] `8.permissions/*`, `9.observability/*`, `10.configuration/*`, `11.deployment/*`, `12.testing/*`, `14.mcp-tools/*`.
- [ ] `13.api-reference/*` — convert option/return tables to `::field-group` blocks; add one-line purpose sentence before every signature.

### Wave 4 — Project + polish

- [ ] `15.project/*`.
- [ ] Global heading sentence-case sweep, filename-meta coverage check on every fenced block, final link check.
- [ ] Walk the full site in the dev server; skim every page cold.

## Acceptance

- [ ] `pnpm check:docs:links`
- [ ] `pnpm docs:api-surface`
- [ ] `pnpm check:docs:api-surface`
- [ ] `pnpm --dir docs build`
- [ ] Verify the first-reader path: landing page -> get started -> installation -> first live query
- [ ] Verify advanced pages no longer compete in the public nav
