# Project Policy

Use pnpm.

After changing Convex files, run:

```bash
pnpm convex:codegen
pnpm typecheck
```

Local Convex dev:

- use `pnpm dev:local` for local Convex-backed Nuxt dev;
- use `pnpm dev:local:reset` only when local backend data can be deleted.

Convex:

- keep business rules in Convex handlers;
- keep public handlers read-only unless the write is intentionally anonymous;
- do not put auth provider ids into domain rows.

Server:

- use `serverConvexQuery`, `serverConvexMutation`, and `serverConvexAction` for server-to-Convex calls;
- use `auth: 'trusted'` only after the server route verified the request.

MCP:

- use `tool.query(...)` for reads;
- use `tool.mutation(...)` only for bounded writes;
- use `tool.operation(...)` for destructive or sensitive actions.
