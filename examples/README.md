# Runnable Examples

Eight examples, progressive difficulty, every one using full Nuxt UI.

These are examples, not CLI templates.

If you want the official productized starting point, use:

- `trellis init app --template personal`
- `trellis init app --template workspace`
- `trellis init app --template workspace-mcp`
- `trellis init app --template cms`

Use this folder when you want to learn the stack, inspect a richer reference, or pressure-test a pattern before it graduates into a template.

## First-Time Reader Path

Read **01 → 02 → 03** in order. Each builds on the previous, adding one major concept per step. `03-team-workspace` is the repo's canonical protected-app reference. Examples 04–08 are reference implementations — pick whichever matches your use case. `05` and beyond are better treated as pattern catalogs than first-reader steps.

## Which One To Open First?

| Example                 | Best for                     | Shows                                                                                                                                        |
| ----------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `01-public-todo`        | First look                   | minimal `defineTrellis(...)`, `defineArgs`, simple query/mutation flow                                                                       |
| `02-auth-todo`          | Auth-only apps               | Better Auth wiring, actor resolution, personal ownership handlers                                                                            |
| `03-team-workspace`     | Canonical protected app      | `convex/auth/*`, backend-owned context, `_can`, transport-shaped agent principals over `#trellis/mcp`, webhook idempotency, `@lupinum/trellis/testing` |
| `04-saas-platform`      | Month-two product work       | Project-management SaaS, pagination, uploads, Nitro routes, `guard`, `_can`, plan entitlements, usage limits, admin workflows                |
| `05-visibility-access`  | Advanced access patterns     | Row-level visibility, field redaction, enrollment, prerequisites, share tokens, inherited access levels, manager hierarchy                   |
| `06-multi-workspace`    | Agency / multi-client        | Multi-workspace membership, workspace switching, cross-tenant agency dashboard                                                               |
| `07-mcp-reference`      | Full MCP implementation      | Hashed MCP keys, public + scoped tools, prompts, resources, sessions, dynamic tools, code mode, root internal refs as the automation surface |
| `08-component-mini-cms` | Local component + MCP seam   | Local Convex components, principal forwarding, root browser wrappers, `createComponentBridge(...)`, `tool(...)`; primary reference for `ginko-cms`-style integrations |

## Concept Coverage Matrix

| Concept                                           | Example |
| ------------------------------------------------- | ------- |
| Public queries/mutations                          | 01      |
| Better Auth + session management                  | 02+     |
| Tenant isolation (`workspaceId` + `by_workspace`) | 03+     |
| Role-based authorization (`guard`, `can`, `deny`) | 03+     |
| Explicit principal forwarding                     | 03, 07, 08 |
| Idempotency (replay protection)                   | 03      |
| Pagination + optimistic updates                   | 04      |
| Plan entitlements + usage limits                  | 04      |
| Feature flags (`hasFeature`)                      | 04      |
| Server routes (Nitro)                             | 03, 04  |
| Row-level visibility (private/team/workspace)     | 05      |
| Field redaction (sensitive fields)                | 05      |
| Manager hierarchy                                 | 05      |
| Enrollment-based access                           | 05      |
| Prerequisite chains                               | 05      |
| Share tokens (hashed, expirable, revocable)       | 05      |
| Inherited access levels                           | 05      |
| Multi-workspace membership                        | 06      |
| Cross-tenant dashboard                            | 06      |
| MCP tools, prompts, resources                     | 03, 07  |
| MCP sessions + dynamic tools                      | 07      |
| MCP key auth (hashed at rest)                     | 07      |
| Local Convex components                           | 08      |
| Component bridge inventory                        | 08      |
| MCP projection over component-backed operations   | 08      |

## Canonical Default

Examples `03` through `06` use the repo's canonical single-workspace contract:

- `workspaceId` as the tenant foreign key
- `by_workspace` as the tenant index name
- `users.authId`, `users.role`, and `users.workspaceId`
- `ownerId` storing the auth-subject string
- `createdAt` / `updatedAt` as millisecond timestamps

Example `06-multi-workspace` is the explicit upgrade path when you need memberships-based
multi-workspace authorization.

## How An Example Graduates Into A Template

An example is ready to become a CLI archetype only when all of this is true:

1. It represents a repeated app family, not a one-off showcase.
2. Its file layout matches the canonical Trellis app shape closely enough to scaffold directly.
3. The remaining setup burden is mostly mechanical and belongs in generators.
4. The pattern has been validated by real app pressure, not just by a nice demo.

## Local Run Flow

Every example is a small workspace app inside this repo with its own `package.json`.

1. `cd` into the example folder.
2. Copy `.env.example` to `.env.local` if that example has app-owned env vars.
3. Run `pnpm install`.
4. Start everything with `pnpm dev`.

`pnpm dev` starts an anonymous local Convex deployment, waits for Convex to write the local deployment
env plus codegen output, then starts Nuxt with the resulting `CONVEX_URL` and `CONVEX_SITE_URL`.

If you copy an example out of this repo, replace `@lupinum/trellis: workspace:*` with a published
version or a packed local tarball before installing.

## Environment Variables

| Example                 | Injected by `pnpm dev`          | App-owned env vars                                                              |
| ----------------------- | ------------------------------- | ------------------------------------------------------------------------------- |
| `01-public-todo`        | `CONVEX_URL`, `CONVEX_SITE_URL` | none                                                                            |
| `02-auth-todo`          | `CONVEX_URL`, `CONVEX_SITE_URL` | `SITE_URL`, `BETTER_AUTH_SECRET`                                                |
| `03-team-workspace`     | `CONVEX_URL`, `CONVEX_SITE_URL` | `SITE_URL`, `BETTER_AUTH_SECRET`, `CONVEX_TRUSTED_CALLER_KEY`                   |
| `04-saas-platform`      | `CONVEX_URL`, `CONVEX_SITE_URL` | `SITE_URL`, `BETTER_AUTH_SECRET`, `CONVEX_TRUSTED_CALLER_KEY`                   |
| `05-visibility-access`  | `CONVEX_URL`, `CONVEX_SITE_URL` | `SITE_URL`, `BETTER_AUTH_SECRET`                                                |
| `06-multi-workspace`    | `CONVEX_URL`, `CONVEX_SITE_URL` | `SITE_URL`, `BETTER_AUTH_SECRET`                                                |
| `07-mcp-reference`      | `CONVEX_URL`, `CONVEX_SITE_URL` | `SITE_URL`, `BETTER_AUTH_SECRET`, `CONVEX_TRUSTED_CALLER_KEY`                   |
| `08-component-mini-cms` | `CONVEX_URL`, `CONVEX_SITE_URL` | `SITE_URL`, `BETTER_AUTH_SECRET`, `CONVEX_TRUSTED_CALLER_KEY`, `DEMO_MCP_TOKEN` |
