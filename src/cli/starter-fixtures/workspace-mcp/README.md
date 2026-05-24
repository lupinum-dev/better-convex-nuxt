# trellis-starter-workspace-mcp

Generated with `trellis init trellis-starter-workspace-mcp --template workspace-mcp`.

## Quick start

```bash
pnpm install
pnpm dev:local
```

Use `pnpm convex:dev` and `pnpm dev` when you want to connect to a hosted Convex dev deployment.

## Canonical shape

- `convex/features/` for backend feature modules
- `shared/features/` for runtime-neutral contracts
- `convex/auth/` for appIdentity and guard logic
- `convex/permissions/` for permission projection when the starter uses access context
- `app/features/` for feature-owned UI and route shells
- server/mcp/ for MCP runtime and tools

## Maintained reference

- Start with the protected-app baseline: [`03-team-workspace`](https://github.com/lupinum-dev/trellis/tree/main/examples/03-team-workspace).
- Then study the MCP branch: [`07-mcp-reference`](https://github.com/lupinum-dev/trellis/tree/main/examples/07-mcp-reference).
