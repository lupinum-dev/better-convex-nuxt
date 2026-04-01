# Runnable Examples

Seven examples, progressive difficulty, every one using full Nuxt UI.

## Which One To Open First?

| Example | Best for | Shows |
|---------|----------|-------|
| `01-public-todo` | First look | raw `query` / `mutation`, `defineArgs` |
| `02-auth-todo` | Auth-only apps | Better Auth wiring, raw Convex handlers |
| `03-team-workspace` | Full-stack multi-tenant apps | `convex/auth/*`, backend-owned context, `_can`, `#convex/mcp`, webhook idempotency, trusted callers, `better-convex-nuxt/testing` |
| `04-saas-platform` | Month-two product work | Project-management SaaS, pagination, uploads, Nitro routes, `guard`, `_can`, plan entitlements, usage limits, admin workflows |
| `05-visibility-access` | Advanced access patterns | Row-level visibility, field redaction, enrollment, prerequisites, share tokens, inherited access levels, manager hierarchy |
| `06-multi-workspace` | Agency / multi-client | Multi-workspace membership, workspace switching, cross-tenant agency dashboard |
| `07-mcp-reference` | Full MCP implementation | Hashed MCP keys, public + scoped tools, prompts, resources, sessions, dynamic tools, code mode |

## Concept Coverage Matrix

| Concept | Example |
|---------|---------|
| Public queries/mutations | 01 |
| Better Auth + session management | 02+ |
| Tenant isolation (`workspaceId` + `by_workspace`) | 03+ |
| Role-based authorization (`guard`, `can`, `deny`) | 03+ |
| Trusted callers + webhook auth | 03 |
| Idempotency (replay protection) | 03 |
| Pagination + optimistic updates | 04 |
| Plan entitlements + usage limits | 04 |
| Feature flags (`hasFeature`) | 04 |
| Server routes (Nitro) | 03, 04 |
| Row-level visibility (private/team/workspace) | 05 |
| Field redaction (sensitive fields) | 05 |
| Manager hierarchy | 05 |
| Enrollment-based access | 05 |
| Prerequisite chains | 05 |
| Share tokens (hashed, expirable, revocable) | 05 |
| Inherited access levels | 05 |
| Multi-workspace membership | 06 |
| Cross-tenant dashboard | 06 |
| MCP tools, prompts, resources | 03, 07 |
| MCP sessions + dynamic tools | 07 |
| MCP key auth (hashed at rest) | 07 |

## Canonical Default

Examples `03` through `06` use the repo's canonical single-workspace contract:

- `workspaceId` as the tenant foreign key
- `by_workspace` as the tenant index name
- `users.authId`, `users.role`, and `users.workspaceId`
- `ownerId` storing the auth-subject string
- `createdAt` / `updatedAt` as millisecond timestamps

Example `06-multi-workspace` is the explicit upgrade path when you need memberships-based
multi-workspace authorization.

## Local Run Flow

Every example is a small consumer app with its own `package.json`.

1. `cd` into the example folder.
2. Copy `.env.example` to `.env.local` if that example has app-owned env vars.
3. Run `pnpm install`.
4. Start everything with `pnpm dev`.

`pnpm dev` starts an anonymous local Convex deployment, waits for Convex to write the local deployment
env plus codegen output, then starts Nuxt with the resulting `CONVEX_URL` and `CONVEX_SITE_URL`.

## Environment Variables

| Example | Injected by `pnpm dev` | App-owned env vars |
|---------|------------------------|--------------------|
| `01-public-todo` | `CONVEX_URL`, `CONVEX_SITE_URL` | none |
| `02-auth-todo` | `CONVEX_URL`, `CONVEX_SITE_URL` | `SITE_URL`, `BETTER_AUTH_SECRET` |
| `03-team-workspace` | `CONVEX_URL`, `CONVEX_SITE_URL` | `SITE_URL`, `BETTER_AUTH_SECRET`, `CONVEX_TRUSTED_CALLER_KEY` |
| `04-saas-platform` | `CONVEX_URL`, `CONVEX_SITE_URL` | `SITE_URL`, `BETTER_AUTH_SECRET`, `CONVEX_TRUSTED_CALLER_KEY` |
| `05-visibility-access` | `CONVEX_URL`, `CONVEX_SITE_URL` | `SITE_URL`, `BETTER_AUTH_SECRET` |
| `06-multi-workspace` | `CONVEX_URL`, `CONVEX_SITE_URL` | `SITE_URL`, `BETTER_AUTH_SECRET` |
| `07-mcp-reference` | `CONVEX_URL`, `CONVEX_SITE_URL` | `SITE_URL`, `BETTER_AUTH_SECRET`, `CONVEX_TRUSTED_CALLER_KEY` |

## Why The Code Is Comment-Heavy

These examples are meant to be read line-by-line by people evaluating the module.

That is why the code includes:

- file header comments explaining why the file exists
- inline comments at the exact points where auth, scoping, authorization, and trusted-caller or bearer-key behavior become non-obvious
- very small business domains so the framework behavior is the only thing you need to learn
