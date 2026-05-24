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

Auth:

- use Better Auth-specific helpers for sign-in and sign-up;
- use `useConvexAuth()` only for provider-neutral auth state;
- use `useBetterAuthClient()` for direct Better Auth client calls;
- do not use session profile ids as app user ids.

Convex:

- keep business rules in Convex handlers;
- use protected handlers for signed-in app work;
- use local `users._id` for domain user references.

Server:

- use `serverConvexQuery`, `serverConvexMutation`, and `serverConvexAction`;
- use `auth: 'trusted'` only after the server route verified the request.

MCP:

- use `tool.query(...)` for reads;
- use `tool.mutation(...)` only for bounded writes;
- use `tool.operation(...)` for destructive or sensitive actions.
