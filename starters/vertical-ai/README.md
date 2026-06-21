# Vertical AI Starter

Starter for AI-assisted SaaS products where agent output must be reviewed before
it becomes canonical product state.

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

