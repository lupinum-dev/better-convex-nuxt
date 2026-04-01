# Runnable Examples

This folder now has two jobs:

- a progressive learning path from `01` to `04`
- a SaaS gallery from `04` to `10` that maps auth shapes to concrete runnable apps

## Which One To Open First?

| Example                  | Best for                     | Shows                                                                                                                                     |
| ------------------------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `01-public-todo`         | First look                   | raw `query` / `mutation`, `defineArgs`                                                                                                    |
| `02-auth-todo`           | Auth-only apps               | Better Auth wiring, raw Convex handlers                                                                                                   |
| `03-team-todo`           | Full-stack multi-tenant apps | `convex/auth/*`, backend-owned context, `_can`, `#convex/mcp`, `better-convex-nuxt/testing`                                               |
| `04-project-board-admin` | Month-two product work       | Project-management SaaS, pagination, optimistic updates, uploads, Nitro routes, `guard`, `_can`, admin workflows, integration + E2E tests |
| `11-mcp-reference`       | Full MCP implementation      | hashed MCP keys, public + scoped tools, prompts, resources, sessions, dynamic tools, code mode                                            |

## Canonical Default

Examples `03` through `09`, plus `11`, use the repo's canonical single-workspace contract:

- `workspaceId` as the tenant foreign key
- `by_workspace` as the tenant index name
- `users.authId`, `users.role`, and `users.workspaceId`
- `ownerId` storing the auth-subject string
- `createdAt` / `updatedAt` as millisecond timestamps

Example `10-agency-portal` is the explicit upgrade path when you need memberships-based
multi-workspace authorization.

If you're here because of shared validators or `shared/` folders rather than auth shape, read:

- [`docs/1.guide/4.shared-schema-dx`](../docs/content/docs/1.guide/4.shared-schema-dx.md)
- [`docs/13.mcp-tools/2.shared-schema`](../docs/content/docs/13.mcp-tools/2.shared-schema.md)

## SaaS Coverage Matrix

| Example                  | SaaS type               | Auth shape                                | Easy problem                               | Hard problem                                                       |
| ------------------------ | ----------------------- | ----------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------ |
| `04-project-board-admin` | Project management      | role + ownership + state guards           | member updates own task                    | archived resources and nested resource guards                      |
| `05-crm-pipeline`        | CRM                     | row visibility + redaction                | rep edits own contact                      | manager/team visibility and sensitive field redaction              |
| `06-course-lms`          | Course / LMS            | relationship access                       | enrolled student reads lesson              | prerequisites, publishing state, timed unlocks                     |
| `07-ecommerce-ops`       | E-commerce back office  | users + webhook bot users                 | admin refunds a valid order                | webhook auth, idempotency, refund-state guards                     |
| `08-freemium-workspace`  | Freemium B2B            | plan entitlements + limits                | plan feature visible in UI                 | count-based project limits                                         |
| `09-doc-sharing`         | Collaboration / sharing | resource sharing + public tokens          | workspace member views a page              | inherited access and token-level enforcement                       |
| `10-agency-portal`       | Agency / multi-client   | controlled cross-tenant access            | client user works inside current workspace | agency-wide dashboard across assigned clients only                 |
| `11-mcp-reference`       | MCP reference app       | real MCP key auth + full protocol surface | public tool discovery                      | session state, dynamic tools, destructive confirmations, code mode |

## Important Repo Note

These apps are **reference examples**. They are intentionally **not** part of the root repo's lint, test, or typecheck commands.

That keeps the main package validation fast and avoids forcing generated Convex files for every example into CI.

## Local Run Flow

Every example is a small consumer app with its own `package.json`.

1. `cd` into the example folder.
2. Copy `.env.example` to `.env.local` if that example has app-owned env vars.
3. Run `pnpm install`.
4. Start everything with `pnpm dev`.

`pnpm dev` starts an anonymous local Convex deployment, waits for Convex to write the local deployment
env plus codegen output, then starts Nuxt with the resulting `CONVEX_URL` and `CONVEX_SITE_URL`.

If you want the old split-terminal workflow for debugging, `pnpm convex:dev` is still available as an
advanced command, but it is local-only and no longer the default example path.

If you are running these examples from inside this repository and the local package link does not resolve yet, run `pnpm dev:prepare` once at the repo root so the package's built exports are available.

## Environment Variables

| Example                  | Injected by `pnpm dev`          | App-owned env vars                                            |
| ------------------------ | ------------------------------- | ------------------------------------------------------------- |
| `01-public-todo`         | `CONVEX_URL`, `CONVEX_SITE_URL` | none                                                          |
| `02-auth-todo`           | `CONVEX_URL`, `CONVEX_SITE_URL` | `SITE_URL`, `BETTER_AUTH_SECRET`                              |
| `03-team-todo`           | `CONVEX_URL`, `CONVEX_SITE_URL` | `SITE_URL`, `BETTER_AUTH_SECRET`, `CONVEX_TRUSTED_CALLER_KEY` |
| `04-project-board-admin` | `CONVEX_URL`, `CONVEX_SITE_URL` | `SITE_URL`, `BETTER_AUTH_SECRET`, `CONVEX_TRUSTED_CALLER_KEY` |
| `05-crm-pipeline`        | `CONVEX_URL`, `CONVEX_SITE_URL` | `SITE_URL`, `BETTER_AUTH_SECRET`                              |
| `06-course-lms`          | `CONVEX_URL`, `CONVEX_SITE_URL` | `SITE_URL`, `BETTER_AUTH_SECRET`                              |
| `07-ecommerce-ops`       | `CONVEX_URL`, `CONVEX_SITE_URL` | `SITE_URL`, `BETTER_AUTH_SECRET`, `CONVEX_TRUSTED_CALLER_KEY` |
| `08-freemium-workspace`  | `CONVEX_URL`, `CONVEX_SITE_URL` | `SITE_URL`, `BETTER_AUTH_SECRET`                              |
| `09-doc-sharing`         | `CONVEX_URL`, `CONVEX_SITE_URL` | `SITE_URL`, `BETTER_AUTH_SECRET`                              |
| `10-agency-portal`       | `CONVEX_URL`, `CONVEX_SITE_URL` | `SITE_URL`, `BETTER_AUTH_SECRET`                              |
| `11-mcp-reference`       | `CONVEX_URL`, `CONVEX_SITE_URL` | `SITE_URL`, `BETTER_AUTH_SECRET`, `CONVEX_TRUSTED_CALLER_KEY` |

## Why The Code Is Comment-Heavy

These examples are meant to be read line-by-line by people evaluating the module.

That is why the code includes:

- file header comments explaining why the file exists
- inline comments at the exact points where auth, scoping, authorization, and trusted-caller or bearer-key behavior become non-obvious
- very small business domains so the framework behavior is the only thing you need to learn
