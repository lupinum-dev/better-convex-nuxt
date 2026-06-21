# Vertical AI Starter

Starter for AI-assisted SaaS products where agent output must be reviewed before
it becomes canonical product state.

## Organization Ownership

This starter intentionally uses app-owned Convex `organizations` and
`memberships` tables. It does not enable the Better Auth Organization plugin.

Keep this model when organization access is part of the product workflow around
draft approval. If you enable Better Auth Organization, remove independent
org/member truth and use Better Auth organization ids on drafts, domain records,
and audit events.

## Includes

- organizations and memberships;
- domain records;
- AI-created drafts;
- human approval and rejection;
- Convex Agent component wiring;
- audit events for approvals.

## Non-goals

- no autonomous writes to canonical state;
- no MCP;
- no multi-agent workflow graph;
- no custom agent runtime;
- no enterprise billing or usage package.

## Commands

```bash
pnpm install
pnpm convex:dev
pnpm dev
pnpm test
pnpm typecheck
```

Run `pnpm convex:dev` once before editing `convex/agents.ts`; Convex needs to
generate `components.agent` for the Agent component.
