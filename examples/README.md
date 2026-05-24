# Runnable Examples

The gallery now has one job: teach Trellis in a clear order first, then branch into advanced patterns.

These are maintained framework references, not CLI templates.

If you want the productized starting points, use:

- `trellis init my-app --template public`
- `trellis init my-app --template personal`
- `trellis init my-app --template workspace`
- `trellis init my-app --template workspace-mcp`

Use this folder when you want to learn the stack, inspect a real pattern, or pressure-test an
architecture before it graduates into a template.

Trellis is a framework with a canonical path, not an unopinionated example buffet. Read the ladder
first, then branch only when the baseline shape is already clear.

## Start Here: 01-04

Read these in order.

| Example             | Purpose                                 | Primary lesson                                                                 |
| ------------------- | --------------------------------------- | ------------------------------------------------------------------------------ |
| `01-public-todo`    | First contact                           | Public data flow with almost no ceremony                                       |
| `02-auth-todo`      | Personal app                            | Better Auth, appIdentity resolution, personal ownership                        |
| `03-team-workspace` | Canonical protected app                 | Single-workspace auth, roles, guards, access context                           |
| `04-saas-platform`  | Server integration branch of the ladder | Nitro routes, uploads, server-owned integrations on top of the workspace model |

The intended ladder is:

1. `01` teaches the Nuxt ↔ Trellis ↔ Convex loop.
2. `02` adds auth without adding tenant complexity.
3. `03` becomes the canonical protected app.
4. `04` shows how server boundaries fit into that protected app model.

If you only read one protected-app example in the repo, read `03-team-workspace`.

If you are evaluating the framework rather than studying advanced branches, stop at `03` first and
only open `04+` after that baseline feels obvious.

## Advanced Branches: 05-08

These are not first-reader steps. Open them once `03` makes sense to you.

| Example                 | Open this when you need          | Primary lesson                                                              |
| ----------------------- | -------------------------------- | --------------------------------------------------------------------------- |
| `05-visibility-access`  | hard authorization rules         | Row visibility, redaction, enrollment, prerequisites, share links           |
| `06-multi-workspace`    | a memberships-based tenant model | Multi-workspace membership, switching, cross-workspace constraints          |
| `07-mcp-reference`      | the workspace-MCP branch         | Public/scoped tools, bounded writes, prompts, resources, confirmations      |
| `08-component-mini-cms` | package-integration architecture | Local components, caller forwarding, bridge inventory, MCP over bridge refs |

## Concept Matrix

| Concept                                   | Canonical example       | Prerequisite                            |
| ----------------------------------------- | ----------------------- | --------------------------------------- |
| Public queries and mutations              | `01-public-todo`        | none                                    |
| Better Auth + appIdentity resolution      | `02-auth-todo`          | `01-public-todo`                        |
| Canonical single-workspace model          | `03-team-workspace`     | `02-auth-todo`                          |
| Guards, access context, `_can`            | `03-team-workspace`     | `02-auth-todo`                          |
| Nitro routes and server-side integrations | `04-saas-platform`      | `03-team-workspace`                     |
| Advanced authorization patterns           | `05-visibility-access`  | `03-team-workspace`                     |
| Membership-based multi-workspace auth     | `06-multi-workspace`    | `03-team-workspace`                     |
| Workspace-MCP starter branch              | `07-mcp-reference`      | `03-team-workspace`                     |
| Component bridge package integration      | `08-component-mini-cms` | `03-team-workspace`, `07-mcp-reference` |

## Canonical Defaults

Examples `03` through `05` use the repo's canonical single-workspace contract:

- `workspaceId` as the tenant foreign key
- `by_workspace` as the tenant index name
- `users.authKey`, `users.role`, and `users.workspaceId`
- `ownerId` storing the auth-subject string
- `createdAt` / `updatedAt` as millisecond timestamps

`06-multi-workspace` is the explicit architectural fork when the canonical single-workspace model is
no longer enough.

## Local Run Flow

Every example is a small app inside this repo with its own `package.json`.

1. `cd` into the example folder.
2. Copy `.env.example` to `.env.local` if that example has app-owned env vars.
3. Run `pnpm install`.
4. Start everything with `pnpm dev`.

Shared script contract:

- `pnpm dev`: canonical local run path through [`scripts/example-dev.mjs`](../scripts/example-dev.mjs)
- `pnpm dev:nuxt`: Nuxt only, for launcher debugging or already-prepared local state
- `pnpm build`: production build of that example app
- `pnpm test`: example-local verification
- `pnpm typecheck`: example-local typecheck
- `pnpm convex:dev` / `pnpm convex:codegen`: raw Convex lanes for backend-focused debugging only

Some examples add narrow extras like `test:e2e` or `typecheck:tests` when they own unique coverage.

`pnpm dev` starts an anonymous local Convex deployment, waits for Convex to write the local
deployment env plus codegen output, then starts Nuxt with the resulting `CONVEX_URL` and
`CONVEX_SITE_URL`.

If you copy an example out of this repo, replace `@lupinum/trellis: workspace:*` with a published
version or a packed local tarball before installing.

## Environment Variables

| Example                 | Injected by `pnpm dev`          | App-owned env vars                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01-public-todo`        | `CONVEX_URL`, `CONVEX_SITE_URL` | none                                                                                                                                                                                                                                                                                                                                                                                                |
| `02-auth-todo`          | `CONVEX_URL`, `CONVEX_SITE_URL` | `SITE_URL` for Better Auth callback origin, `BETTER_AUTH_SECRET` for auth signing                                                                                                                                                                                                                                                                                                                   |
| `03-team-workspace`     | `CONVEX_URL`, `CONVEX_SITE_URL` | `SITE_URL` for Better Auth callback origin, `BETTER_AUTH_SECRET` for auth signing, `CONVEX_IDENTITY_FORWARDING_KEY` for identity-forwarded server-to-Convex calls, `TEAM_WORKSPACE_WEBHOOK_SECRET` for the webhook route boundary, `TEAM_WORKSPACE_WEBHOOK_USER_ID` for the delegated local app user used by the webhook example                                                                    |
| `04-saas-platform`      | `CONVEX_URL`, `CONVEX_SITE_URL` | `SITE_URL` for Better Auth callback origin, `BETTER_AUTH_SECRET` for auth signing, `CONVEX_IDENTITY_FORWARDING_KEY` for identity-forwarded server-to-Convex calls, `PROJECT_BOARD_WEBHOOK_SECRET` for the webhook route boundary                                                                                                                                                                    |
| `05-visibility-access`  | `CONVEX_URL`, `CONVEX_SITE_URL` | `SITE_URL` for Better Auth callback origin, `BETTER_AUTH_SECRET` for auth signing                                                                                                                                                                                                                                                                                                                   |
| `06-multi-workspace`    | `CONVEX_URL`, `CONVEX_SITE_URL` | `SITE_URL` for Better Auth callback origin, `BETTER_AUTH_SECRET` for auth signing                                                                                                                                                                                                                                                                                                                   |
| `07-mcp-reference`      | `CONVEX_URL`, `CONVEX_SITE_URL` | `SITE_URL` for Better Auth callback origin, `BETTER_AUTH_SECRET` for auth signing, `CONVEX_IDENTITY_FORWARDING_KEY` for identity-forwarded server-to-Convex calls, `MCP_RATE_LIMIT_REDIS_URL` for the distributed MCP rate-limit store, `MCP_REFERENCE_WEBHOOK_SECRET` for the webhook route boundary, `MCP_REFERENCE_WEBHOOK_USER_ID` for the delegated local app user used by the webhook example |
| `08-component-mini-cms` | `CONVEX_URL`, `CONVEX_SITE_URL` | `SITE_URL` for Better Auth callback origin, `BETTER_AUTH_SECRET` for auth signing, `CONVEX_IDENTITY_FORWARDING_KEY` for identity forwarding into the component boundary, `JWKS` for local auth bootstrap, `DEMO_MCP_TOKEN` for the demo MCP caller identity                                                                                                                                         |

## How an Example Graduates Into a Template

An example is ready to become a CLI archetype only when all of this is true:

1. It represents a repeated app family, not a one-off showcase.
2. Its file layout matches the canonical Trellis app shape closely enough to scaffold directly.
3. The remaining setup burden is mostly mechanical and belongs in generators.
4. The pattern has been validated by real app pressure, not just by a nice demo.
