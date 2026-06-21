# Starters Research

Status: research foundation complete; implementation spikes are documented.

Goal: define serious, repeatable Convex + Nuxt starters without rebuilding
Trellis or Lupinum as a rigid platform.

This folder collects the evidence and requirements for a starter family. The
working conclusion is:

```text
multiple prepared starters
+ small shared Convex/Nuxt primitives only where invariants repeat
+ copyable recipes
- one configurable mega-template
- app-wide platform DSL by default
```

## Research Passes

1. [Local Lessons](./001-local-lessons.md)
2. [External Evidence](./002-external-evidence.md)
3. [Requirements](./003-requirements.md)
4. [Starter Matrix](./004-starter-matrix.md)
5. [MCP And Agents](./005-mcp-and-agents.md)
6. [Decisions And Open Questions](./006-decisions-and-open-questions.md)
7. [Second Pass: Hosting And API Fit](./007-hosting-and-api-fit.md)
8. [Implementation Readiness](./008-implementation-readiness.md)
9. [Completion Audit](./009-completion-audit.md)

## Current Recommendation

Build a starter family, not a single universal starter:

- `public`: public Convex app, no auth.
- `personal`: signed-in user app, no organizations.
- `team`: organization/workspace SaaS with members, invites, and RBAC.
- `agency`: agency org manages client orgs through delegated access.
- `mcp-agent`: organization app with service actors, MCP tools, and Convex
  Agent integration.
- `vertical-ai`: domain-specific AI SaaS starter using agents, drafts, review,
  and approval.

The starters may share a small access kernel after duplication proves stable,
but each starter must remain understandable as a normal app.

## Non-Negotiable Direction

- Convex owns data invariants and authorization.
- Nuxt owns UI ergonomics, not backend policy.
- MCP and agents are caller surfaces, not separate domain models.
- Destructive or sensitive tool calls require backend-enforced approval or an
  explicit product reason not to.
- No dormant MCP/auth/workspace machinery in starters that do not need it.
- No compatibility paths for unreleased starter experiments.
