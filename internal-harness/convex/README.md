# Playground Convex Workspace

This folder contains the Convex backend used by `playground/`.

Use it for:

- local feature development
- reproducing bugs and regressions
- testing auth, permissions, pagination, upload, and server helper behavior
- exercising the MCP verification flow with real `mcp_*` keys

Key files:

- `auth.ts`: playground Better Auth setup
- `http.ts`: Better Auth route registration
- `schema.ts`: playground schema
- `mcpKeys.ts`: playground MCP key issuance, validation, and touch tracking
- `testing.ts`: test-only reset and MCP smoke seed helpers
- `*.test.ts`: backend and auth-related regression tests

For the canonical MCP curl flow, use [../MCP_VERIFICATION.md](../MCP_VERIFICATION.md) and the UI pages:

- `/demo/mcp-keys`
- `/demo/mcp-verify`
- `/demo/permissions`

For shared local setup and env ownership, use [../../DEVELOPMENT.md](../../DEVELOPMENT.md).
