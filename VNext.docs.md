# Better Convex Nuxt documentation vNext

Status: implementation contract
Scope: public documentation, homepage, agent feeds, README alignment, and migration from the legacy documentation tree
Canonical content: `docs/content/`
Target release documented: `better-convex-nuxt@0.6.1`

## 1. Outcome

Create documentation that does three jobs in this order:

1. Help a Nuxt developer decide whether Better Convex Nuxt is the right integration.
2. Give that developer a correct mental model before presenting a large API surface.
3. Let a person or coding agent retrieve one authoritative answer for a specific task.

The documentation should sell the library with demonstrated capabilities and explicit trade-offs. It must not use unsupported claims, hide costs, or present application-owned behavior as package behavior.

The finished system contains one homepage and 76 documentation pages. The legacy pages are removed in the same cutover. This file is the plan and review contract; it does not duplicate the prose of the finished pages.

## 2. Primary reader

The primary reader is a Nuxt 4 developer who knows Vue and TypeScript, is considering Convex, and wants SSR, realtime data, server calls, and possibly Better Auth without maintaining integration glue.

They arrive with one of four questions:

- Why should I use this instead of a smaller wrapper or a manual integration?
- How do SSR, hydration, subscriptions, and identity fit together?
- How do I complete one concrete task correctly?
- What is the exact API, option, error, or deployment requirement?

The docs must provide a short path for each question without requiring a full sequential read.

Secondary readers are maintainers, reviewers, search engines, and coding agents. They need stable terminology, explicit preconditions, complete examples, predictable headings, and no contradictory sources of truth.

## 3. Product thesis

Better Convex Nuxt is the integrated Nuxt runtime for Convex:

- one query lifecycle from SSR to hydration to live browser updates;
- identity-aware query ownership and isolation;
- a maintained Better Auth boundary;
- request-scoped Convex calls from Nitro;
- typed mutations, actions, optimistic state, uploads, and errors;
- explicit boundaries between Nuxt UX and Convex authorization.

The library deliberately limits configuration and compatibility paths to preserve those invariants. The docs must explain why each constraint exists and what the reader gives up.

Do not claim the package provides:

- a permissions or RBAC framework;
- backend authorization through route middleware or hidden UI;
- arbitrary Better Auth plugin compatibility;
- a generic entity cache;
- a durable job queue;
- static-only authenticated hosting;
- compatibility with dependency versions outside the published tuple.

## 4. Documentation principles

### 4.1 One source of truth

Each important concept has one canonical page. Other pages link to it and provide only the local context needed to complete their task. Reference pages enumerate behavior; conceptual pages explain behavior; recipes compose behavior. Do not copy entire explanations between them.

Generated public API data comes from `scripts/generate-api-surface.mjs` and is written only to `docs/content/docs/6.reference/7.api-surface.md`.

### 4.2 Concepts before options

Explain ownership, lifecycle, identity, and failure boundaries before listing switches. A reader should understand the consequence of `server`, `subscribe`, and query auth modes before changing them.

### 4.3 Evidence before adjectives

Prefer “renders the query during SSR and continues it as a browser subscription” over “seamless” or “powerful.” Every product claim must map to shipped code, tests, package metadata, or a maintained starter.

### 4.4 Explicit security boundary

Every auth or permission example must state which part is navigation UX and which Convex handler enforces access. Never imply that client code, route middleware, MCP discovery, or transport metadata authorizes a backend operation.

### 4.5 Hard cutover

Do not retain old and new docs trees, aliases, duplicate examples, or compatibility prose after the new tree passes verification. Preserve only intentional redirects for meaningful public URLs.

### 4.6 Agent-ready content

Every page must be independently retrievable and understandable. Use exact exported names, explicit argument objects, real file names, declared imports, complete failure behavior, and links to the canonical neighboring concept.

## 5. Writing system

The voice is a page-dependent blend of five modes:

1. **Product-direct** for the homepage and overview: confident, concrete, outcome first.
2. **Technical-explanatory** for mental models: plain language, causal sequence, visible trade-offs.
3. **Task-directive** for get-started and build pages: imperative steps, minimal detours, verified code.
4. **Recipe-pragmatic** for end-to-end use cases: state the invariant, show the composition, name failure and cleanup paths.
5. **Reference-precise** for APIs and operations: terse, exhaustive, neutral, stable terminology.

Shared rules:

- Lead with the answer or outcome.
- Keep paragraphs short and headings descriptive.
- Use “you” for reader actions and the package name or “the module” for library behavior.
- Prefer active voice and concrete verbs.
- Define a term once and reuse it exactly.
- Use sentence case for headings.
- Avoid hype, throat-clearing, fake quotations, jokes in critical instructions, and repeated summaries.
- Avoid “simply,” “just,” “obviously,” “magic,” “seamless,” and “production-ready” without evidence.
- Do not use bare placeholder ellipses in runnable examples.
- Examples must show imports unless Nuxt auto-imports the symbol.
- Use `status`, structured errors, and explicit empty args rather than truthiness shortcuts.
- Every destructive example names its authorization, confirmation, and cleanup responsibility.

## 6. Page contract

Every page must have:

- frontmatter `title` and `description` written for retrieval, not marketing duplication;
- one clear job;
- an opening answer that stands alone in search or agent context;
- prerequisites when the page depends on prior setup;
- complete code at the smallest useful scale;
- explicit lifecycle and error behavior where relevant;
- links to deeper concepts instead of copied explanations;
- no claims outside the current public API and tested dependency tuple.

Task pages should usually follow this order:

1. Outcome and prerequisites.
2. Minimal implementation.
3. What happens at runtime.
4. Failure and security behavior.
5. Variations and next links.

Concept pages should usually follow this order:

1. Thesis.
2. Owners and sequence.
3. Invariants.
4. Trade-offs.
5. Consequences for application code.

Reference pages should enumerate exact names, types, defaults, states, and import paths. They should not become tutorials.

## 7. Information architecture

The numbered source folders control navigation order. Public routes omit numeric prefixes.

```text
docs/content/
├── index.md
└── docs/
    ├── 1.overview/                 # 6 pages
    ├── 2.understand/               # 9 pages
    ├── 3.get-started/              # 8 pages
    ├── 4.build/                    # 32 pages in 6 groups
    ├── 5.recipes/                  # 8 pages
    ├── 6.reference/                # 7 pages
    └── 7.operations/               # 6 pages
```

The navigation answers progressively different questions:

- **Overview:** Should I adopt it?
- **Understand:** How and why does it work?
- **Get started:** How do I reach a correct first result?
- **Build:** How do I implement a particular capability?
- **Recipes:** How do the capabilities compose in a real use case?
- **Reference:** What exactly is exported or configurable?
- **Operations:** How do I deploy, secure, diagnose, and upgrade it?

## 8. Page briefs

Each brief defines the page's unique responsibility and minimum coverage. Finished prose may improve the sequence but must not transfer the responsibility to a second page.

### 8.1 Homepage

#### `docs/content/index.md` — Convex for Nuxt, without the integration glue

- Sell the integrated lifecycle with a factual headline and one install command.
- Show four compact examples: query, write, auth, and request-scoped Nitro call.
- Present six shipped differentiators: SSR-to-realtime, Better Auth, explicit security boundaries, server calls, optimistic writes, and file workflows.
- Link immediately to the mental model and comparison page.
- Do not claim a permissions framework or generic production readiness.

### 8.2 Overview

#### `1.overview/1.introduction.md` — Better Convex Nuxt

- Define the package and the problem it solves.
- Show the smallest SSR-to-realtime query.
- State what Convex, Nuxt, Better Auth, and the application each own.
- Route readers to evaluation, concepts, or setup.

#### `1.overview/2.why-better-convex-nuxt.md` — Why Better Convex Nuxt

- Describe the integration work the package removes.
- Explain why one lifecycle and one identity boundary matter.
- Distinguish meaningful runtime behavior from convenience auto-imports.
- State the cost of choosing an opinionated integration.

#### `1.overview/3.who-it-is-for.md` — Who it is for

- Give positive fit signals and clear non-fit signals.
- Cover new Nuxt apps, existing Convex apps, SSR needs, auth needs, and teams willing to use the tested tuple.
- Recommend a manual integration when the application needs unsupported topology or arbitrary behavior.

#### `1.overview/4.use-cases.md` — Use cases

- Demonstrate dashboards, collaboration, SaaS, content plus private state, uploads, and Nitro orchestration.
- Tie each use case to specific library behavior.
- Avoid generic industry marketing.

#### `1.overview/5.comparison.md` — Compare Nuxt integrations

- Compare `better-convex-nuxt`, `nuxt-convex`, `convex-nuxt`, and manual Convex integration.
- Pin comparison date and released package versions.
- Compare SSR, hydration, subscriptions, auth, server calls, files, maintenance surface, and constraints.
- Use primary evidence from released npm artifacts and official repositories.
- Separate facts from recommendations and identify which reader each option fits.

#### `1.overview/6.limitations.md` — Limitations and trade-offs

- Document Nitro requirement for auth, exact peer tuple, constrained auth proxy, anonymous transport, SSR cost, and application-owned authorization.
- Explain the benefit protected by each limitation.
- Link to compatible alternatives rather than hiding non-fit cases.

### 8.3 Understand

#### `2.understand/1.mental-model.md` — Mental model

- Establish canonical ownership: Nuxt UX/rendering, Convex data/invariants, Better Auth sessions, module coordination.
- Show the client, server, and identity flows.
- Make “transport identity, enforce authorization in Convex” memorable.

#### `2.understand/2.request-lifecycle.md` — Request lifecycle

- Follow one query through request creation, auth settlement, SSR call, payload, hydration, subscription, update, and disposal.
- Name where data lives at every stage.
- Explain skipped and client-only variants.

#### `2.understand/3.ssr-hydration-realtime.md` — SSR, hydration, and realtime

- Explain the three stages independently and together.
- Cover when to disable SSR or subscriptions.
- State SEO, latency, load, and staleness trade-offs.

#### `2.understand/4.query-ownership-and-caching.md` — Query ownership and caching

- Explain per-Nuxt-app shared subscriptions, normalized keys, owner counting, and disposal.
- Distinguish shared live state from a general entity cache.
- Explain when to wrap state in an application composable.

#### `2.understand/5.authentication-and-identity.md` — Authentication and identity

- Define auth states and the `required`, `optional`, and `none` query modes.
- Explain stable identity keys, generation changes, client replacement, and anonymous isolation.
- State how sign-in, sign-out, user switching, and token refresh differ.

#### `2.understand/6.server-and-client-boundaries.md` — Server and client boundaries

- Map components, Nuxt plugins, Nitro handlers, Convex functions, auth definitions, and shared error code to supported imports.
- Explain request scope and why browser clients must not leak into server code.

#### `2.understand/7.errors-and-failures.md` — Errors and failures

- Define public error categories and safe versus throwing call paths.
- Explain serialization, redaction, recovery ownership, and expected cancellation.
- Reject message parsing as control flow.

#### `2.understand/8.design-decisions.md` — Design decisions

- Record the rationale for explicit query args, three auth modes, stable handles, one server caller, one error type, fixed auth proxy, no permissions runtime, and no compatibility shims.
- Pair every restriction with the invalid state or maintenance cost it avoids.

#### `2.understand/9.glossary.md` — Glossary

- Define all canonical lifecycle, identity, transport, query, auth, server, and error terms.
- Keep definitions short and link to owning pages.
- Ban competing synonyms where they would confuse retrieval.

### 8.4 Get started

#### `3.get-started/1.choose-your-path.md` — Choose your path

- Offer public-data-first, auth-first, and existing-project paths.
- State time, prerequisites, and destination for each.
- Recommend public-data-first unless identity is the first invariant to prove.

#### `3.get-started/2.installation.md` — Installation

- Install the package and exact peer dependencies.
- Register the module and public Convex URL.
- Verify `#convex/api` generation and explain local environment file handling.

#### `3.get-started/3.first-realtime-page.md` — First realtime page

- Define a small Convex query and render it from a Nuxt page.
- Show explicit args, `await`, status, SSR, hydration, and live updates.
- Include a verification procedure with two browser views.

#### `3.get-started/4.add-a-mutation.md` — Add a mutation

- Define a validated mutation and submit a form.
- Show operation state and failure display.
- Demonstrate that the live query updates without manual refetch.

#### `3.get-started/5.add-authentication.md` — Add authentication

- Install the Convex Better Auth component and define the typed client.
- Register HTTP routes and required environment values.
- Add sign-in and sign-out with the integrated identity lifecycle.
- Use the supported cookie and same-origin proxy contract only.

#### `3.get-started/6.protect-data.md` — Protect data

- Add backend ownership checks first.
- Add route metadata second as navigation UX.
- Test with two identities and direct calls.

#### `3.get-started/7.project-structure.md` — Project structure

- Give one recommended placement for Nuxt UI, app composables, server code, Convex functions, auth files, and policy helpers.
- Explain each boundary and avoid extra layers.

#### `3.get-started/8.next-steps.md` — Next steps

- Route readers by desired behavior: query, write, auth, server, files, reliability, recipes, or operations.
- Do not repeat those guides.

### 8.5 Build: queries

#### `4.build/1.queries/1.queries.md` — Queries

- Document signature, explicit args, result state, SSR, subscription, transforms, auth mode, and safe failure rendering.

#### `4.build/1.queries/2.reactive-arguments.md` — Reactive arguments

- Cover refs, computed args, route params, filter normalization, `'skip'`, and avoiding unstable object churn.

#### `4.build/1.queries/3.loading-and-stale-data.md` — Loading and stale data

- Define status transitions for first load, arg change, skip, error, and retained data.
- Provide deterministic UI patterns.

#### `4.build/1.queries/4.ssr-options.md` — Query execution options

- Explain `server`, `subscribe`, `waitTimeoutMs`, and per-query auth mode.
- Provide a decision table and consequences, not only syntax.

#### `4.build/1.queries/5.sharing-query-state.md` — Share query state

- Show multiple owners sharing one subscription and an app composable for coordinated UI.
- Warn against copying results into a second cache.

#### `4.build/1.queries/6.pagination.md` — Pagination

- Cover initial SSR page, loading more, pagination status, reactive filters, auth, and live page behavior.

### 8.6 Build: write data

#### `4.build/2.write-data/1.mutations.md` — Mutations

- Cover call signature, pending/error/data state, safe results, callbacks, validation, and transactional backend responsibility.

#### `4.build/2.write-data/2.actions.md` — Actions

- Explain when actions are appropriate, state model, safe calls, and why actions are not transactions or a durable queue.

#### `4.build/2.write-data/3.optimistic-updates.md` — Optimistic updates

- Update regular and paginated cached queries with exact keys.
- Explain automatic rollback, temp identity, ordering, and cross-identity isolation.

#### `4.build/2.write-data/4.concurrent-operations.md` — Concurrent operations

- Explain operation generations and the limits of a single shared pending ref.
- Show application-owned per-item state where overlapping work matters.

### 8.7 Build: authentication

#### `4.build/3.authentication/1.overview.md` — Authentication

- Map setup, state, operations, routes, authorization, plugins, custom fields, and projections.

#### `4.build/3.authentication/2.better-auth-setup.md` — Better Auth setup

- Define server config, component, HTTP routes, Nuxt client definition, environment variables, and proxy constraints.

#### `4.build/3.authentication/3.auth-state-and-user.md` — Auth state and user data

- Document canonical session status and choose among session user, JWT claims, Better Auth component data, and app projection.

#### `4.build/3.authentication/4.sign-in-and-sign-out.md` — Sign in and sign out

- Cover email, social, sign-up, sign-out, integrated identity settlement, errors, redirects, and advanced refresh only where needed.

#### `4.build/3.authentication/5.route-protection.md` — Route protection

- Document page metadata, redirect target, return-to behavior, loading settlement, and the UX-only security status.

#### `4.build/3.authentication/6.backend-authorization.md` — Backend authorization

- Show identity, ownership, tenant membership, roles, non-enumerating failures, indexes, and invariant tests inside Convex.

#### `4.build/3.authentication/7.better-auth-plugins.md` — Better Auth plugins

- Explain typed client plugin registration and schema-changing server plugins.
- State fixed-proxy cookie limitations and require explicit compatibility evidence.

#### `4.build/3.authentication/8.custom-user-fields.md` — Custom user fields

- Provide a placement decision for session fields, Better Auth records, JWT claims, and app profile data.
- Avoid duplicated mutable truth.

#### `4.build/3.authentication/9.user-synchronization.md` — User synchronization

- Describe an optional rebuildable application projection.
- Mark Better Auth as identity/session truth and define triggers, reconciliation, deletion, and invariant tests.

### 8.8 Build: server

#### `4.build/4.server/1.server-convex.md` — `serverConvex`

- Document request-scoped caller creation, auth policies, query/mutation/action methods, safe variants, and explicit anonymous calls.

#### `4.build/4.server/2.server-routes.md` — Server routes

- Show input validation, request-scoped call, structured error-to-HTTP mapping, and response minimization.

#### `4.build/4.server/3.webhooks-and-jobs.md` — Webhooks and jobs

- Verify raw webhook input before Convex calls.
- Explain idempotency, quick acknowledgement, durable work ownership, and why Nitro memory is not a queue.

#### `4.build/4.server/4.credentials-and-security.md` — Credentials and server security

- Explain cookies, bearer exchange, explicit principals, origin validation, body/time bounds, redaction, trusted ingress headers, and least privilege.

### 8.9 Build: files

#### `4.build/5.files/1.upload-files.md` — Upload files

- Show upload URL generation, progress, cancellation, completion, and attaching the storage ID to app data.

#### `4.build/5.files/2.upload-queues.md` — Upload queues

- Cover bounded concurrency, item and aggregate state, cancellation, retry policy, and lifecycle cleanup.

#### `4.build/5.files/3.storage-urls.md` — Storage URLs

- Resolve reactive storage IDs, handle missing/deleted files, and describe URL lifecycle and browser rendering.

#### `4.build/5.files/4.validation-and-deletion.md` — File validation and deletion

- Enforce limits before and after upload, authorize metadata, prevent orphans, and coordinate deletion without pretending storage and database writes are one transaction.

### 8.10 Build: application behavior

#### `4.build/6.application-behavior/1.connection-state.md` — Connection state

- Define connected, reconnecting, offline, and pending-operation signals.
- Keep transport state distinct from backend health and mutation confirmation.

#### `4.build/6.application-behavior/2.error-handling.md` — Error handling

- Provide one strategy across query, mutation, action, auth, upload, and server errors using `ConvexCallError`.

#### `4.build/6.application-behavior/3.logging.md` — Logging

- Document `false`, `info`, and `debug`, useful events, production defaults, redaction, and correlation without credentials.

#### `4.build/6.application-behavior/4.devtools.md` — DevTools

- Explain what can be inspected, development-only scope, and the limits of client observations.

#### `4.build/6.application-behavior/5.performance.md` — Performance

- Optimize queries, indexes, arguments, payloads, SSR selection, subscriptions, pagination, and static JWKS only from measurement.
- State rotation cost and tuple-specific limitations.

### 8.11 Recipes

#### `5.recipes/1.protected-dashboard.md` — Protected dashboard

- Compose route UX, required query auth, backend ownership, loading, and logout.

#### `5.recipes/2.realtime-feed.md` — Realtime feed

- Compose pagination, stable ordering, optimistic inserts, duplicate prevention, and empty/reconnect state.

#### `5.recipes/3.optimistic-todo-list.md` — Optimistic todo list

- Compose create, toggle, delete, temporary state, rollback, and accessible pending controls.

#### `5.recipes/4.infinite-scroll.md` — Infinite scroll

- Compose pagination with `IntersectionObserver`, cleanup, duplicate-call protection, and an accessible manual fallback.

#### `5.recipes/5.file-upload-form.md` — File upload form

- Compose validation, upload, app record, preview, deletion, failure compensation, and authorization.

#### `5.recipes/6.organization-permissions.md` — Organization permissions

- Compose canonical membership, backend checks, application-owned UI capabilities, tenant switching, and invariant tests.

#### `5.recipes/7.authenticated-server-route.md` — Authenticated server route

- Compose input validation, required request identity, Convex call, safe HTTP mapping, and no credential logging.

#### `5.recipes/8.public-and-private-data.md` — Public and private data

- Combine `auth: 'none'` public SSR content with a required private query without cross-identity state.

### 8.12 Reference

#### `6.reference/1.composables.md` — Composables

- Enumerate every auto-imported composable and optimistic helper with signature, state, key options, and canonical guide.

#### `6.reference/2.auth-components.md` — Auth components

- Document the four global auth-state components, slots, rendering state, and disabled-auth behavior.

#### `6.reference/3.server-api.md` — Server API

- Enumerate request caller, methods, token exchange, user projection helper, imports, options, and errors.

#### `6.reference/4.error-types.md` — Error types

- Enumerate `ConvexCallError`, kinds, public fields, safe result envelopes, normalization, serialization, and redaction.

#### `6.reference/5.module-configuration.md` — Module configuration

- Enumerate every supported option, type, default, normalization rule, environment fallback, and complete example.

#### `6.reference/6.package-exports.md` — Package exports

- Enumerate root exports, auth client, auth server, server, errors, user sync, Nuxt aliases, auto-import boundaries, and removed paths.

#### `6.reference/7.api-surface.md` — API surface

- Generated only. List registered composables, helpers, server aliases, and global components with source and guide links.

### 8.13 Operations

#### `7.operations/1.environment-variables.md` — Environment variables

- Separate Nuxt public endpoints from Convex auth secrets.
- Explain build-time versus deploy-time resolution, previews, exact origins, and verification.

#### `7.operations/2.deployment.md` — Deployment

- Define supported topology, deployment order, production checklist, preview isolation, CSP connectivity, and end-to-end health checks.

#### `7.operations/3.security-model.md` — Security model

- Define every trust boundary, backend authorization, proxy contract, browser bearer risk, operator responsibility, and reporting path.

#### `7.operations/4.troubleshooting.md` — Troubleshooting

- Diagnose missing URLs, hydration mismatch, auth proxy failure, auth modes, subscriptions, structured errors, and uploads from the failing boundary inward.

#### `7.operations/5.migration-guide.md` — Migration guide

- Provide the direct pre-0.6 to current cutover for config, args, auth modes, client definition, server caller, errors, and removed permissions runtime.
- Reject dual paths and compatibility adapters.

#### `7.operations/6.release-compatibility.md` — Release compatibility

- Pin the current Node, Nuxt, Convex, Better Auth, and adapter tuple.
- Explain narrow versions, upgrade ceremony, pre-1.0 cutovers, and the difference between compiling and verified compatibility.

## 9. Research and evidence rules

Before changing claims, inspect sources in this order:

1. Current source and tests in this repository.
2. `package.json`, generated package exports, and module API surface.
3. Maintained starters and playground only where they reflect supported behavior.
4. `CHANGELOG.md`, `SECURITY.md`, architecture decisions, and release tooling.
5. Released npm tarballs for competitor comparisons.
6. Official upstream documentation and repositories.

Do not use memory for volatile version, compatibility, security, or competitor claims. Record a comparison date. Prefer released artifacts over unreleased default branches. If evidence is incomplete, say that it is unverified.

Reference generation must fail when docs drift from registered public APIs. Handwritten reference pages must not invent symbols absent from generated source or package exports.

## 10. Legacy migration map

Remove these legacy directories after vNext verification:

```text
docs/content/docs/1.guide/
docs/content/docs/2.data-fetching/
docs/content/docs/3.mutations/
docs/content/docs/4.auth-security/
docs/content/docs/5.server-side/
docs/content/docs/6.advanced/
docs/content/docs/7.recipes/
docs/content/docs/8.architecture/
```

Meaningful old public routes should redirect to the closest canonical page. Do not preserve every historical heading or deep link if it has no clear equivalent. Minimum redirects:

| Old route                            | New route                                   |
| ------------------------------------ | ------------------------------------------- |
| `/docs/guide/get-started`            | `/docs/get-started/choose-your-path`        |
| `/docs/guide/basics`                 | `/docs/get-started/first-realtime-page`     |
| `/docs/guide/auth`                   | `/docs/get-started/add-authentication`      |
| `/docs/guide/concepts`               | `/docs/understand/mental-model`             |
| `/docs/data-fetching/queries`        | `/docs/build/queries/queries`               |
| `/docs/data-fetching/pagination`     | `/docs/build/queries/pagination`            |
| `/docs/mutations/mutations`          | `/docs/build/write-data/mutations`          |
| `/docs/mutations/actions`            | `/docs/build/write-data/actions`            |
| `/docs/mutations/optimistic-updates` | `/docs/build/write-data/optimistic-updates` |
| `/docs/auth-security/authentication` | `/docs/build/authentication/overview`       |
| `/docs/server-side/server-routes`    | `/docs/build/server/server-routes`          |
| `/docs/server-side/ssr-hydration`    | `/docs/understand/ssr-hydration-realtime`   |
| `/docs/advanced/module-config`       | `/docs/reference/module-configuration`      |
| `/docs/advanced/api-surface`         | `/docs/reference/api-surface`               |
| `/docs/advanced/file-storage`        | `/docs/build/files/upload-files`            |

Update the homepage, README, llms sections, sitemap inputs, raw Markdown generation, generated API guide URLs, repository-local links, and metadata in the same change.

## 11. Agent retrieval requirements

- The public navigation, sitemap, raw Markdown routes, `llms.txt`, and full LLM feed must all derive from the same vNext content tree.
- Folder and page names must be semantic after numeric prefixes are stripped.
- Descriptions must distinguish neighboring pages.
- A page must not require hidden context from a previous page to interpret code.
- Code fences should include file labels where placement matters.
- Tables should have one fact per cell and valid escaped union types.
- Cross-links must use final public routes.
- Generated pages must identify themselves as generated and point back to canonical source.

## 12. Verification and acceptance criteria

The rewrite is complete only when all criteria pass.

### Content integrity

- Exactly one homepage and 76 vNext documentation pages exist.
- The seven vNext sections contain 6, 9, 8, 32, 8, 7, and 6 pages respectively.
- All legacy documentation directories are deleted.
- No current page links to a legacy route except a redirect test or migration explanation.
- No page claims a built-in permissions framework.
- All query examples pass an explicit args object or `'skip'`.
- All server examples use `serverConvex` rather than removed wrappers.
- Auth configuration uses `auth: false` as the only off-switch.
- Reference names match the generated API surface and package exports.
- The comparison is version- and date-pinned.

### Tooling

- `pnpm run docs:api-surface`
- `pnpm run check:api-surface-docs`
- `pnpm run check:vocabulary`
- formatting check for the repository
- docs lint and typecheck
- production docs build

Run broader module tests when source behavior or generation contracts change. End-to-end tests are not required for prose-only edits unless the documentation tooling itself changes runtime behavior.

### Manual review

- Read the homepage at mobile and desktop widths.
- Traverse every navigation section.
- Open every internal link or run an equivalent link checker.
- Confirm old high-value routes redirect.
- Inspect raw Markdown for representative nested pages.
- Inspect agent feeds and verify all seven sections are present once.
- Search for stale public symbols, old routes, false permission claims, placeholder code, and unescaped Markdown tables.
- Confirm no secrets, tokens, local absolute paths, or research artifacts entered public content.

## 13. Review rubric

Score every page against five questions:

1. **Decision:** Does the reader know when to use this behavior and when not to?
2. **Model:** Does the page preserve ownership, lifecycle, identity, and security invariants?
3. **Action:** Can the reader complete the task from the shown code and prerequisites?
4. **Failure:** Does the page explain loading, error, cleanup, and destructive behavior relevant to the task?
5. **Retrieval:** Can a person or agent understand the answer when this page is returned alone?

A page that fails an invariant is wrong even if its code looks plausible. A page that duplicates a canonical explanation should be shortened and linked. A page that exists only for symmetry should be deleted or merged.

## 14. Maintenance rule

Any public API, dependency tuple, auth boundary, or generated alias change must update its canonical reference page, affected task pages, migration guidance, and generated API surface in the same pull request. Product copy changes only when shipped evidence changes.

Keep this file as the documentation architecture and review contract. Keep the public docs as the only user-facing source of truth.
