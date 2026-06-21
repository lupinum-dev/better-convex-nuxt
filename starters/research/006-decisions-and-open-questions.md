# 006 Decisions And Open Questions

## Decisions For Pass 1

1. Build a starter family, not a single universal starter.
2. Treat `better-convex-nuxt` as the Nuxt/Convex integration primitive.
3. Keep starter domain code app-owned until duplication proves a shared kernel.
4. Use simple RBAC for `team` and `agency` starters.
5. Defer ABAC, ReBAC, custom tenant roles, and materialized permissions.
6. Model agency/client access as delegated organization access, not nested
   tenants.
7. MCP and agents call the same Convex functions as the UI.
8. Use Convex Agent for agent runtime/persistence before creating our own.
9. Keep public OAuth MCP out of starter v1.
10. Put SSO/SCIM/enterprise readiness in recipes or later starters, not default
    team starter infrastructure.

## Decisions For Pass 2

1. Use Convex Agent for agent persistence and tool approval unless a concrete
   starter spike proves it cannot represent the needed actor/workspace context.
2. Start MCP with hand-written tool adapters.
3. Do not generate MCP wrappers until repeated tool boilerplate is measured in
   a real starter.
4. Use `better-convex-nuxt` server helpers for user-session Nitro calls, but do
   not treat them as the whole service-actor solution.
5. Spike MCP hosting before choosing Nitro, Convex HTTP actions, or a separate
   Node server as the permanent starter path.

## Decisions For Pass 3

1. Build `public` first, then `team`, then `agency`.
2. Do not extract `packages/convex-b2b` until `team` and `agency` both have
   tested duplicate invariants.
3. Do not add a starter doctor initially.
4. Require invariant tests before broad e2e.
5. Treat the MCP host as a spike gate before `mcp-agent`.

## Confidence

High confidence:

- Multiple starters are safer than a universal template.
- Organization + membership is the right B2B baseline.
- Agency/client access is a first-class starter shape.
- MCP/agents must reuse backend access, not duplicate authorization.
- Convex Agent should be composed first.

Medium confidence:

- A small `convex-b2b` shared package will probably emerge after `team` and
  `agency`, but extracting it before implementation would repeat the platform
  failure mode.
- Private workspace MCP with service actors is enough for early starters.
- Approval v0 is enough for starter-level destructive safety.

Low confidence / needs proof:

- Whether `personal` should be built before `team`.
- Whether `vertical-ai` belongs as a starter or as a recipe over `mcp-agent`.
- Whether the `agency` starter should include client-facing auth on day one or
  model agency-only backoffice first.
- Whether WorkOS/SSO belongs in an `enterprise` starter or recipes only.
- Whether Nitro is the right default host for remote Streamable HTTP MCP.

## Open Questions

1. Should the starter folder live in this repo permanently, or should starter
   apps become their own repo once direction stabilizes?
2. Should starter names use `organization` or `workspace` in code?
3. Should `agency` use `organizationLinks` or a more explicit
   `managedClientAccess` table?
4. Should audit be app-owned table in each starter or a shared package once
   `team` and `agency` both need it?
5. Should approval state live in app-owned tables first, or should we reuse the
   Lupinum confirmation component idea immediately?
6. How much Nuxt UI should starters include before they become design systems?
7. Should MCP be implemented through Nitro in Nuxt, Convex HTTP actions, or both
   as separate recipes?
8. How do we verify starter quality without rebuilding Trellis doctor?

## Next Research Pass

Pass 4 should inspect and document only after choosing the first starter:

- exact implementation checklist for that starter;
- exact package versions;
- whether the existing singular `starter/` draft should be deleted, moved, or
  rewritten into `starters/public`.

## Stop Conditions

Do not proceed to implementation until we can answer:

1. What starter do we build first?
2. What exact files does it contain?
3. What invariant test proves it works?
4. What code is intentionally duplicated instead of shared?
5. What would force us to extract a shared package?
6. What would force us to add operation/codegen machinery?
