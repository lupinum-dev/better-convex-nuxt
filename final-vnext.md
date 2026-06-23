# Final vNext Direction

Date: 2026-06-23

This is the consolidated direction after combining the attached feedback, the current repository state, and fresh upstream checks. Treat it as the next execution memo, not as another research backlog.

## Verdict

Continue with `better-convex-nuxt`, but make the product cut stricter.

The core package should remain the Nuxt integration layer for Convex and Better Auth. SaaS, AI agents, MCP, OAuth provider flows, billing, SCIM, Stripe, and org policy should ship as verified, editable starters or recipes.

Do not turn the package into a SaaS framework, agent framework, MCP platform, or generic authorization engine.

The promise worth defending is:

```txt
Use Nuxt, Convex, and Better Auth together without hidden glue.
Better Auth owns identity and auth-domain state.
Convex owns product data and backend invariants.
Nuxt owns UX and transport ergonomics.
```

## Current Repo Reality

The core package is already mostly in the right shape. Its public surface is integration-oriented:

- Convex client injection and runtime config.
- SSR-aware query support.
- Realtime query, mutation, action, pagination, storage, and upload composables.
- Better Auth proxy support.
- Convex auth token sync.
- `useConvexAuth()`, `useConvexUser()`, and `createBetterConvexAuthClient()`.
- Auth components and route-protection helpers.
- Devtools.
- `createUserSyncTriggers()` for a clearly derived user projection.

That is enough surface for the package. The expensive work is now in starters and recipes, not in `src/runtime`.

The repo also has several active starter directions:

- `starters/team` is the canonical tenant-aware SaaS baseline. It already documents Better Auth Organization as the source of truth.
- `starters/agentic-saas` is the right isolated track for in-product AI agents with explicit delegation records.
- `starters/mcp-agent` is useful as a private MCP/service-actor proof, but not the public OAuth/MCP future.
- `starters/platform-auth` is the right place to prove public OAuth Provider and MCP token behavior.
- `starters/vertical-ai` overlaps with `agentic-saas` unless it keeps a domain-specific purpose.
- `starters/agency` is valid only if agency/client delegation is genuinely a product-domain model and not a second copy of Better Auth Organization.

The repo is also currently carrying broad uncommitted starter/doc changes. Do not mix this direction with opportunistic implementation refactors. First make the product cut explicit, then delete or quarantine overlapping paths.

## Upstream Checks

Fresh checks support the same direction:

- Better Auth's Convex integration guide recommends a local Better Auth Convex component when schema and plugin control matter. That matches the team starter path. Source: [Better Auth Convex integration](https://better-auth.com/docs/integrations/convex).
- Better Auth Organization exposes `hasPermission()` for server-side permission checks, and dynamic access control is an extra database-backed mode. Static roles should stay the default. Source: [Better Auth Organization](https://better-auth.com/docs/plugins/organization).
- Better Auth OAuth Provider is the current forward path for OAuth 2.1, OIDC-compatible, MCP-enabled authorization server behavior. It supports authorization code, refresh token, and client credentials grants in docs. Source: [Better Auth OAuth Provider](https://better-auth.com/docs/plugins/oauth-provider).
- Better Auth's June 2026 security update says scoped packages such as `@better-auth/oauth-provider`, `@better-auth/scim`, and `@better-auth/sso` must be updated directly, and deprecated OIDC/MCP plugins should migrate toward OAuth Provider. Source: [Better Auth security update, June 2026](https://better-auth.com/blog/security-update-june-2026).
- The current Better Auth MCP plugin docs say it is moving to OAuth Provider. Do not base a new public product path on the old plugin. Source: [Better Auth MCP plugin](https://better-auth.com/docs/plugins/mcp).
- MCP authorization requires protected-resource metadata, resource indicators, and token audience validation for protected HTTP servers. This is too security-sensitive to fold into the default SaaS starter. Source: [MCP authorization spec](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization).
- The 2026-07-28 MCP release candidate signals continued protocol churn. Treat it as a warning to keep public MCP isolated until the spec and clients settle. Source: [MCP 2026-07-28 release candidate](https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/).
- Nuxt MCP Toolkit is a good transport/devtools fit for Nuxt apps, with file-based tools and Zod validation. It is not an authorization model. Source: [Nuxt MCP Toolkit](https://mcp-toolkit.nuxt.dev/).
- Convex Agent is the right component for threads, messages, streaming, tools, usage tracking, rate limiting, and workflows. It should be composed, not reimplemented. Source: [Convex Agent docs](https://docs.convex.dev/agents/overview).
- Convex still has platform constraints that argue against loading every provider and platform dependency into core: bundled function code has a 32 MiB limit, Node runtime belongs in actions, and actions have time and memory limits. Sources: [Convex bundling](https://docs.convex.dev/functions/bundling), [Convex runtimes](https://docs.convex.dev/functions/runtimes), [Convex actions](https://docs.convex.dev/functions/actions).
- Convex query scalability still depends on indexes, bounded reads, and avoiding broad scans. That argues against default rollups, projections, and generic permission tables until requirements force them. Sources: [Convex indexes](https://docs.convex.dev/database/reading-data/indexes/), [Convex best practices](https://docs.convex.dev/understanding/best-practices/).

Package registry check on 2026-06-23:

| Package                       | Latest seen | Current repo signal            |
| ----------------------------- | ----------: | ------------------------------ |
| `better-auth`                 |    `1.6.20` | root uses `^1.6.20`            |
| `@better-auth/oauth-provider` |    `1.6.20` | platform recipe uses this path |
| `@convex-dev/better-auth`     |    `0.12.4` | root uses `^0.12.4`            |
| `convex`                      |    `1.41.0` | root uses `^1.32.0`            |
| `@convex-dev/agent`           |     `0.6.4` | `agentic-saas` uses `^0.3.2`   |
| `@nuxtjs/mcp-toolkit`         |    `0.17.2` | used in MCP starter            |

Do not blindly bump these in the same change. Use this as a dependency audit gate for each recipe.

## Product Cut

Use three layers.

```txt
Core package = integration primitives
Starters = editable product patterns
Recipes = optional advanced capabilities with proof scripts
```

### Core Package

Keep in `better-convex-nuxt`:

- Nuxt module setup.
- Convex client runtime wiring.
- Query, mutation, action, pagination, storage, upload, and connection composables.
- SSR auth token hydration.
- Better Auth proxy and Convex JWT sync.
- Better Auth client helper for Vue/Nuxt.
- Auth components.
- Devtools.
- Derived user projection trigger helper with rebuild semantics.
- Docs that teach the local Better Auth Convex component path.

Do not add to core:

- Organizations, memberships, invitations, teams, or roles.
- Product tables such as projects, files, drafts, approvals, agent runs, API clients, usage events, subscriptions, invoices, or audit events.
- A generic permission DSL.
- `agentRuns`.
- MCP tools.
- OAuth Provider routes.
- Billing rollups.
- Stripe abstractions.
- SCIM abstractions.
- Convex Agent wrappers.
- Provider SDKs.
- Nuxt MCP Toolkit dependency.
- `convex-authz` or a custom authz component.

If a proposed core export is only useful for one starter, it belongs in that starter.

### Starter Layer

Starter code should be normal app code, visible and editable:

```txt
convex/auth.ts
convex/http.ts
convex/betterAuth/*
convex/lib/authz.ts
convex/lib/audit.ts
convex/projects.ts
convex/agentRuns.ts
server/mcp/tools/*
app/pages/*
```

Do not hide product policy behind package internals. Developers should be able to delete a feature by deleting ordinary files.

### Recipe Layer

Recipes are advanced and opt-in:

- Admin.
- API keys.
- Dynamic org roles.
- Teams.
- Passkeys, TOTP, email OTP, magic links.
- Stripe.
- SCIM.
- Private MCP.
- Public OAuth/MCP.
- Provider-backed agents.
- Rate limiting.
- Usage billing.

Each recipe needs its own proof command and explicit acceptance criteria before it is marketed.

## Source Of Truth

| Concept               | Canonical owner                       | Rule                                                              |
| --------------------- | ------------------------------------- | ----------------------------------------------------------------- |
| User                  | Better Auth                           | App `users` table may only be a derived projection.               |
| Session               | Better Auth                           | Convex token state is derived from Better Auth session state.     |
| Organization          | Better Auth Organization in team SaaS | No app-owned organization mirror in `team-saas`.                  |
| Member                | Better Auth Organization in team SaaS | No app-owned membership mirror in `team-saas`.                    |
| Invitation            | Better Auth Organization in team SaaS | Do not reimplement invitation lifecycle.                          |
| Role                  | Better Auth Organization              | Static roles by default. Dynamic roles are advanced.              |
| Team                  | Better Auth Organization when enabled | No app-owned team-member mirror.                                  |
| API key               | Better Auth API Key                   | Raw secrets never enter app tables.                               |
| OAuth client/token    | Better Auth OAuth Provider            | `platform-auth` only until lifecycle and deployed MCP are proven. |
| Product data          | App Convex tables                     | Store Better Auth ids as strings.                                 |
| Product authorization | App Convex functions                  | Ask Better Auth, then enforce product invariants in Convex.       |
| Product audit         | App Convex tables                     | Immutable product history, not auth-domain state.                 |
| Agent thread/message  | Convex Agent component                | Infrastructure history only. Not authorization authority.         |
| Agent delegation      | App `agentRuns` table                 | Explicit bounded authority for one run.                           |
| MCP transport         | Nuxt MCP Toolkit                      | Transport and discovery only. Never final authorization.          |

The invariant is simple: every important concept gets one source of truth. Derived data must be named as derived, rebuildable, and tested.

## What To Do Now

### 1. Freeze Core Scope

Do not add more core abstractions for SaaS, agents, MCP, or OAuth.

Immediate core work should be limited to:

- Keep existing public API stable enough to support the starters.
- Keep package exports and auto-import docs accurate.
- Tighten docs so `createPermissions()` is described as UI/display ergonomics, not backend authorization.
- Preserve `createUserSyncTriggers()` as a derived projection helper, not an invitation to mirror Better Auth state.
- Run dependency audit separately for `convex` and component packages. Do not bundle that with starter product changes.

Acceptance:

```bash
pnpm lint
pnpm test:types
pnpm check:contracts
pnpm test
pnpm prepack
```

If `format:check` is still broadly failing from existing docs/starter formatting, fix formatter ownership as a separate mechanical change. Do not let format noise decide architecture.

### 2. Make `starters/team` The Canonical `team-saas`

Do not create a duplicate `starters/team-saas` directory yet. That would add churn without a product benefit.

Use the existing `starters/team` as the canonical source and teach it publicly as `team-saas`.

Now:

- Keep Better Auth Organization as canonical org/member/invite/team/role state.
- Keep product tables keyed by Better Auth organization ids.
- Keep product authorization in Convex functions using Better Auth permission checks.
- Keep app `users` as a derived projection only.
- Keep raw organization deletion out of the starter UI.
- Keep Stripe, SCIM, OAuth Provider, MCP, and agents out of this base starter.

Delete or quarantine any old code path that recreates app-owned organization, membership, or invitation truth in this starter.

Acceptance:

```bash
cd starters/team
pnpm feedback:local-baseline
pnpm feedback:starter-ui-cutover
pnpm feedback:better-auth-product-authz
pnpm test
pnpm typecheck
```

Before marketing the starter:

```bash
cd starters/team
pnpm feedback:better-auth-all
```

### 3. Cut Starter Overlap

There are too many adjacent starter stories right now. Keep the smallest set that proves distinct product shapes.

Recommended status:

| Starter         | Status                 | Decision                                                                                                 |
| --------------- | ---------------------- | -------------------------------------------------------------------------------------------------------- |
| `public`        | keep                   | Base Nuxt + Convex starter, no auth.                                                                     |
| `team`          | canonical              | This is `team-saas`.                                                                                     |
| `agentic-saas`  | keep                   | In-product AI agents with Better Auth org truth and explicit delegation.                                 |
| `platform-auth` | keep experimental      | Public OAuth Provider and future public MCP proof only.                                                  |
| `mcp-agent`     | keep experimental      | Private MCP/service-actor proof. Do not present as public OAuth MCP.                                     |
| `agency`        | conditional            | Keep only if agency/client delegation is a real product-domain model.                                    |
| `vertical-ai`   | likely archive or fold | Fold into `agentic-saas` unless it proves a distinct vertical workflow that `agentic-saas` must not own. |

Do not build a shared B2B package yet. Duplication across starters is cheaper than extracting the wrong abstraction.

Acceptance:

- Each kept starter has one paragraph that says what it owns and what it does not own.
- Every starter that uses Better Auth Organization deletes app-owned org/member/invite mirrors.
- Every starter that intentionally uses app-owned organizations explains why Better Auth Organization is not the source of truth there.
- No starter keeps both paths.

### 4. Promote `agentic-saas` Next, But Keep The Product Cut

`agentic-saas` is the right next major template after `team-saas`, but it should stay opt-in.

The core model:

- Better Auth owns humans, organizations, members, roles, and sessions.
- Convex app tables own `agentRuns`, drafts, approval requests, usage events, and product audit.
- Convex Agent owns thread/message infrastructure.
- Agents are not Better Auth organization members.
- Agent tools are adapters over normal product helpers.
- Default agent writes create drafts or approval requests.
- Canonical destructive writes require human approval.

Do not add:

- MCP.
- OAuth Provider.
- service actors.
- API-key actors.
- billing rollups.
- generated tool wrappers.
- provider SDK fan-out.
- a generic agent permission framework.

Next proof:

1. Keep mock LLM paths in tests.
2. Add one provider-enabled variant or explicit provider proof path, not OpenAI, Anthropic, Gemini, and gateways at once.
3. Prove streaming, tool calls, draft creation, approval, usage event recording, and failed-run cleanup against a real provider.
4. Prove the browser approval flow against a configured Convex deployment, not only anonymous local Convex.

Acceptance:

```bash
cd starters/agentic-saas
pnpm test
pnpm typecheck
pnpm build
pnpm convex:local:once
pnpm convex:codegen
```

Provider/deployment gate:

```bash
# Requires explicit env, not mock defaults.
OPENAI_API_KEY=... NUXT_PUBLIC_CONVEX_URL=... CONVEX_DEPLOYMENT=... pnpm <provider-proof-command>
```

Do not claim production-ready provider support before that proof exists.

### 5. Keep MCP Private First

`mcp-agent` is useful because it proves service actors, credential hashes, approvals, secret redaction, and Nuxt MCP Toolkit routing. It should remain a private integration recipe.

The rule:

```txt
tools/list visibility is UX.
tools/call authorization is Convex.
```

Next:

- Keep tools hand-written.
- Keep service actor credentials hashed.
- Keep destructive operations approval-gated.
- Do not generate wrappers for every Convex function.
- Do not use MCP annotations or tool visibility as security controls.
- Do not claim public OAuth MCP from this starter.

Acceptance:

```bash
cd starters/mcp-agent
pnpm test
pnpm typecheck
pnpm build
```

### 6. Keep Public OAuth/MCP In `platform-auth`

Public OAuth/MCP should not be default, and it should not be merged into `team-saas` or `agentic-saas`.

`platform-auth` exists to answer one question:

```txt
Can Better Auth OAuth Provider, Convex, Nuxt, and MCP produce a standards-shaped,
deployed, resource-bound public authorization surface without app-level shims?
```

Keep this starter hard-cut to OAuth Provider. Do not mount deprecated OIDC/MCP plugins beside it.

Current blocker:

- Refresh-token rotation has a Convex adapter/provider contract gap around `revoked` being omitted versus queried as explicit `null`.

Do not paper over that in app code. Resolve it upstream or in the adapter contract before public claims.

Next proof:

- Pin and audit `@better-auth/oauth-provider`.
- Prove metadata, DCR, PKCE authorization code, refresh rotation, revocation, introspection, client credentials, resource-bound JWTs, and local JWKS verification.
- Prove Nuxt MCP Toolkit execution into real Convex product functions using OAuth Provider tokens.
- Prove deployed runtime behavior.
- Prove token invalidation semantics.

Acceptance:

```bash
cd starters/platform-auth
pnpm typecheck
pnpm convex:local:once
pnpm feedback:oauth-provider-runtime
```

Public claim gate:

- No refresh rotation blocker.
- No local-only proof tokens.
- No deprecated Better Auth MCP/OIDC plugin dependency.
- OAuth tokens are audience/resource-bound.
- Direct `tools/call` fails in Convex when unauthorized.
- Revoked tokens fail.
- Deployed Nuxt MCP Toolkit route can call a product function only through checked authorization.

### 7. Defer Billing Rollups

Raw usage events are enough now.

Do not add:

- invoice tables;
- billing rollup tables;
- background aggregation jobs;
- usage projections;
- caches;
- generic entitlement services.

Add billing structure only when the product requirement says what must be billed, how often, at what granularity, and how disputes/rebuilds work.

Current acceptable shape:

- Append-only usage events.
- Explicit org/user/run ids derived from canonical state.
- Non-negative token counts.
- Provider/model labels normalized at write time.
- Budget checks at execution boundaries.

### 8. Fix Generated Artifact Policy

The repo currently has generated Convex files in new starter work. Decide the policy before shipping more starter changes.

Recommended policy:

- Commit Better Auth generated component schema when it is required for local component type safety and review.
- Do not commit Convex `_generated` files in starters unless the starter is intentionally self-contained and the check script explicitly allows that case.
- Keep `check:no-starter-generated-artifacts` aligned with the chosen policy.
- Do not let generated artifacts create noisy diffs during architecture work.

Acceptance:

```bash
pnpm check:no-starter-generated-artifacts
```

If that command fails, either delete the generated files or update the policy and check script in the same change.

### 9. Stabilize Docs Around One Canonical Story

Right now the repo has `new-direction.md`, `roadmap.md`, `ai-learnings.md`, architecture docs, experiments, and starter READMEs. That is useful research, but it is too much for a product path.

Do not delete the research immediately. First make the hierarchy explicit:

1. `final-vnext.md` is the current execution memo.
2. `docs/content/docs/8.architecture/1.saas-kit-direction.md` is the published architecture version.
3. `docs/content/docs/8.architecture/2.ai-agents-and-mcp.md` is the published AI/MCP version.
4. `roadmap.md`, `new-direction.md`, `ai-learnings.md`, and `experiments/*` are research ledgers.

Then update docs so they do not contradict the current source-of-truth map.

Acceptance:

- The public docs do not imply core owns SaaS policy.
- The public docs do not claim public OAuth/MCP is ready.
- The public docs do not claim Stripe/SCIM/SSO as default starter features.
- The public docs do not teach app-owned org/member tables for `team-saas`.

## Rejected Paths

Reject these now:

- A `@better-convex-nuxt/saas` mega-package.
- A hidden tenant framework.
- A generic authorization DSL.
- A Better Auth plugin that owns product authorization.
- `convex-authz` as the default starter.
- `convex-tenants` beside Better Auth Organization in the default starter.
- Agents as Better Auth org members.
- Public OAuth/MCP in the base SaaS starter.
- Generated MCP wrappers for every Convex function.
- Billing rollups before billing requirements.
- Dynamic roles by default.
- Enterprise SSO as a pure Convex starter claim.
- SCIM full lifecycle until route-method support and deletion/update semantics are proven.
- Compatibility shims for unreleased starter paths.

Each rejected path can come back only with a concrete acceptance criterion that cannot be met by deleting or simplifying the existing path.

## Next Milestones

### Milestone 0: Product Cut

Goal: make the direction impossible to misread.

Work:

- Land `final-vnext.md`.
- Link or mirror it from architecture docs.
- Mark research ledgers as research.
- Decide generated artifact policy.
- Stop adding broad starter features until this is done.

Acceptance:

- One source-of-truth map is visible.
- Starter status is explicit.
- No new core surface is introduced.

### Milestone 1: Core Hardening

Goal: release the integration library without expanding scope.

Work:

- Keep package exports checked.
- Keep auto-import docs generated.
- Audit dependency versions separately.
- Make docs precise about backend authorization.

Acceptance:

```bash
pnpm lint
pnpm test:types
pnpm check:contracts
pnpm test
pnpm prepack
```

### Milestone 2: Canonical `team-saas`

Goal: make `starters/team` the template people should copy for tenant-aware SaaS.

Work:

- Keep Better Auth Organization canonical.
- Keep product authorization in Convex.
- Keep raw org deletion out of UI.
- Keep advanced recipes out of base flow.

Acceptance:

```bash
cd starters/team
pnpm feedback:local-baseline
pnpm feedback:starter-ui-cutover
pnpm feedback:better-auth-product-authz
pnpm feedback:better-auth-all
pnpm test
pnpm typecheck
```

### Milestone 3: Provider-Enabled `agentic-saas`

Goal: prove one real provider path without changing core.

Work:

- Pick one provider.
- Keep mock provider in tests.
- Add explicit env-gated provider proof.
- Prove streaming and tool calls.
- Prove approval flow against configured Convex.

Acceptance:

- Tests stay green without provider keys.
- Provider proof fails clearly without required env.
- Real provider proof writes drafts, approvals, audit, and usage correctly.
- No MCP/OAuth/service-actor leakage into `agentic-saas`.

### Milestone 4: Private MCP Recipe

Goal: make private MCP boring and secure.

Work:

- Keep Nuxt MCP Toolkit in recipe only.
- Keep tools hand-written.
- Keep Convex as execution authorization.
- Keep destructive actions approval-gated.

Acceptance:

- `tools/list` may be broad, but unauthorized `tools/call` fails.
- Secret material never enters model-visible args or persisted messages.
- Tests cover wrong org, wrong role, revoked credential, and destructive approval.

### Milestone 5: Public `platform-auth`

Goal: prove public OAuth/MCP only after standards and lifecycle behavior are real.

Work:

- Resolve refresh rotation blocker upstream or in adapter contract.
- Prove OAuth Provider lifecycle.
- Prove deployed Nuxt MCP Toolkit execution into Convex product functions.

Acceptance:

- No deprecated Better Auth MCP/OIDC plugin.
- Resource-bound tokens.
- Revocation and introspection proven.
- Deployed route proven.
- Direct unauthorized `tools/call` denied by Convex.

## Release Positioning

Say:

- "Nuxt + Convex + Better Auth integration."
- "Verified editable SaaS starters."
- "Better Auth owns auth-domain state."
- "Convex enforces product invariants."
- "AI and MCP recipes are opt-in."

Do not say:

- "Complete SaaS framework."
- "Universal permission system."
- "Public OAuth/MCP ready."
- "Enterprise SSO solved."
- "Billing included."
- "Agents can act as organization members."

## Final Rule

For every next change, ask:

1. Does this create a second source of truth?
2. Can we delete an older path instead?
3. Can this remain normal userland code?
4. Is this required by a passing acceptance test?
5. Would I want to debug this in production?

If the answer is weak, do not add it.
