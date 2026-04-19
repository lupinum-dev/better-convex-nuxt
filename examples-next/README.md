# Examples Next

This folder is the **next-generation example portfolio** for Trellis.

It is not a random list of “apps we like.”
It is a pressure suite for the framework we want to become:

- an opinionated application platform for Nuxt + Convex + Better Auth
- with first-class agent support from day 1

The test is not “can we clone product X pixel by pixel?”

The test is:

**If Trellis can power these app families cleanly, then it is broad enough to be a real application framework.**

## Portfolio Rules

Every example here must prove at least one of these:

1. a core Trellis primitive is truly reusable across app types
2. an advertised framework guarantee holds in a realistic app
3. an advanced use case can be reached without bending the core into knots
4. agent support stays part of the same backend model instead of becoming a side system

If an example does not pressure the framework, it is marketing, not validation.

## The Coverage We Want

| Example | App family | Inspired by | Core pressure on Trellis |
|---|---|---|---|
| `01-kanban-workspace` | collaborative board SaaS | Trello | real-time lists, drag-and-drop ordering, role-based workspace access, activity log |
| `02-product-issue-tracker` | product execution app | Linear | workflows, triage, priority, assignees, views, keyboard-driven power-user flows, API-safe mutations |
| `03-docs-wiki` | docs + database workspace | Notion | rich document permissions, nested content trees, comments, partial public sharing, structured content views |
| `04-community-courses` | membership + learning community | Skool | cohorts, gated content, billing-aware access, events, moderation, member roles |
| `05-headless-cms-publishing` | CMS + delivery pair | ginko-cms + consumer-site | editorial workflow, publish/unpublish, preview, role lanes, content projection into a consumer site |
| `06-agency-client-ops` | agency / multi-client workspace graph | agency OS / client portal | client workspaces, cross-workspace staff access, per-client data isolation, portfolio dashboards, operator boundaries |
| `07-support-inbox-crm` | support + account ops | Intercom / Zendesk / HubSpot | per-customer visibility, assignment, internal notes vs customer-visible replies, webhook-heavy integrations |
| `08-commerce-backoffice` | commerce + billing ops | Shopify / Stripe dashboard | orders, refunds, entitlements, admin cross-tenant views, audit-heavy destructive actions |
| `09-agent-operator-console` | agent-native app | internal AI ops / automation console | tools as first-class app surface, capability-aware agents, safe destructive automation, human approval loops |

## Why This Is Better Than Just “Trello, Notion, Linear”

Those product names are useful because people recognize them.
They are not enough on their own.

The important part is the **application pressure** each one creates:

- board apps pressure real-time mutation ergonomics
- issue trackers pressure workflow/state transitions
- docs apps pressure visibility and nested sharing
- community apps pressure auth + billing + moderation
- CMS apps pressure role lanes and publishing contracts
- agency apps pressure multi-workspace membership graphs and legitimate cross-tenant operator access
- support apps pressure visibility boundaries and integrations
- commerce apps pressure audit and admin escape hatches
- agent consoles pressure the full Trellis agent story

That is the portfolio.

## Build Order

The order below is optimized for framework learning, not market hype.

### Wave 1 — Core app model

1. `01-kanban-workspace`
2. `02-product-issue-tracker`
3. `03-docs-wiki`
4. `06-agency-client-ops`

These four answer:

- Is the backend model ergonomic?
- Is tenancy clean?
- Can multi-workspace and client-workspace membership stay understandable?
- Are protected mutations expressive enough?
- Does visibility hold up outside simple CRUD?

### Wave 2 — business application depth

5. `04-community-courses`
6. `05-headless-cms-publishing`
7. `07-support-inbox-crm`

These answer:

- Can Trellis cover common SaaS patterns beyond “team task app”?
- Does the auth + tenancy + role model stay coherent?
- Can one protected backend model serve browser, webhooks, and server-side automation?

### Wave 3 — agent and operator depth

8. `08-commerce-backoffice`
9. `09-agent-operator-console`

These answer:

- Are destructive operations safe enough for serious admin tooling?
- Is the agent story really first-class?
- Can Trellis expose the same backend model safely to humans and agents?

## Current Repo Mapping

The existing `examples/` folder still matters:

- `03-team-workspace` is the current baseline protected app
- `04-saas-platform` already pressures practical SaaS flows
- `06-multi-workspace` already proves there is demand for switching and cross-tenant views, but it should evolve toward the explicit agency/client-workspace model above
- `07-mcp-reference` is the current richest agent surface
- `08-component-mini-cms` is the current boundary experiment

`examples-next/` is not replacing those yet.
It is the cleaner target portfolio that future example work should converge toward.

These are candidate archetypes, not official starters.

Current workspace rule: until one of these apps graduates into `examples/`, it should keep the same narrow script contract as the maintained examples:

- `pnpm dev` through the shared example launcher
- `pnpm dev:nuxt` for launcher-free Nuxt debugging
- `pnpm build`, `pnpm test`, `pnpm typecheck`
- raw `convex:dev` / `convex:codegen` only for backend-focused maintenance

If an `examples-next` app needs a broader script vocabulary, that is a signal to simplify the app or promote a new shared workflow intentionally.

Today the official starters are still:

- `personal`
- `workspace`
- `cms`

MCP remains a capability on `workspace`, not a separate starter.

The likely future promotions from this folder are:

- `05-headless-cms-publishing` -> deeper `cms` lane pressure
- `07-support-inbox-crm` -> `support-inbox`
- `09-agent-operator-console` -> `agent-console`

## Success Criteria

Trellis is in good shape if these examples can be built while keeping:

- one backend authorization model
- one tenancy model
- one operation model for safe destructive work
- one agent runtime story
- minimal raw escape hatches

If an example requires a totally separate pattern, Trellis needs to improve or narrow its claims.
