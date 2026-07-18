# Public Starter

Small Nuxt + Convex starter for public apps.

## Includes

- one public `todos` table;
- realtime list query;
- create, toggle, and remove mutations;
- invariant tests for validation and list ordering.

## Non-goals

- no auth;
- no organizations;
- no MCP;
- no agents;
- no shared access package.

## Commands

```bash
pnpm install
pnpm convex:configure
pnpm dev
pnpm test
pnpm typecheck
```

Use `pnpm convex:dev` after `.env.local` exists; it selects only the deployment
recorded in that file.
