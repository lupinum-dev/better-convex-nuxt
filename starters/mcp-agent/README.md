# MCP Agent Starter

Starter for organization apps that expose a small MCP surface to service
actors.

## Organization Ownership

This starter intentionally uses app-owned Convex `organizations` and
`memberships` tables because service actors, credentials, approvals, and audit
events are product-domain records scoped to those organizations.

It does not enable the Better Auth Organization plugin. If you enable Better
Auth Organization, remove independent org/member truth and key service actors,
credentials, approvals, projects, and audit events by Better Auth organization
ids.

## Includes

- organizations and memberships;
- service actors scoped to one organization;
- credential hashes;
- MCP-style `tools/list` and `tools/call` HTTP route;
- project read/write tools;
- approval-gated destructive mutation;
- audit events for service actor calls.

## Non-goals

- no public OAuth MCP;
- no generated tool wrappers;
- no broad platform manifest;
- no custom agent runtime;
- no shared B2B package yet.

## Commands

```bash
pnpm install
pnpm convex:dev
pnpm dev
pnpm test
pnpm typecheck
```

The MCP route is `POST /mcp`. It supports `initialize`, `tools/list`, and
`tools/call`. Use a bearer token whose SHA-256 hash is stored in
`agentCredentials.secretHash`.
