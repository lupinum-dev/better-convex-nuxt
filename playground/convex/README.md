# Playground Convex Workspace

This folder contains the Convex backend used by `playground/`.

Use it for:

- local feature development
- reproducing bugs and regressions
- testing auth, permissions, pagination, upload, and server helper behavior

Key files:

- `auth.ts`: playground Better Auth setup
- `http.ts`: Better Auth route registration
- `schema.ts`: playground schema
- `private/*`: app-local privileged Convex examples guarded by `CONVEX_PRIVATE_BRIDGE_KEY`
- `*.test.ts`: backend and auth-related regression tests

For shared local setup and env ownership, use [../../DEVELOPMENT.md](../../DEVELOPMENT.md).
