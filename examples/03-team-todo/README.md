# Team Todo Example

This is the full V2 showcase.

It shows:

- real auth
- actor resolution
- tenant-scoped tables
- declarative permissions
- frontend permission checks with `createPermissions()`
- MCP tools built with `#convex/mcp`

## Files To Read First

1. `convex/functions.ts`
2. `convex/permissions.config.ts`
3. `shared/schemas/todo.ts`
4. `convex/todos.ts`
5. `composables/usePermissions.ts`
6. `server/mcp/tools/*.ts`

## Demo Flow

1. Create account A and create workspace `alpha` -> that user becomes `owner`.
2. Create account B and join workspace `alpha` as `member`.
3. Create account C and create workspace `beta`.
4. Add todos in both orgs and verify lists stay isolated.
5. Use the MCP curl commands below to manage Alpha's todos as account A.

## MCP Demo Auth

To keep the example focused, MCP auth uses a tiny demo middleware:

- header format: `Authorization: Bearer demo:<email>`
- middleware resolves that email to a real user in Convex
- `#convex/mcp` then injects service auth into the scoped Convex calls

Example:

```bash
curl http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer demo:owner@example.com' \
  -d '{"method":"tools/list","params":{}}'
```
