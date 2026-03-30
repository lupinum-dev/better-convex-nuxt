# Runnable Examples

This folder contains four standalone apps that show the V2 API at increasing levels of complexity.

## Which One To Open First?

| Example          | Best for                     | Shows                                                                                                        |
| ---------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `01-public-todo` | First look                   | `publicQuery`, `publicMutation`, `defineArgs`                                                                |
| `02-auth-todo`   | Auth-only apps               | `authedQuery`, `authedMutation`, `defineActorConfig`, Better Auth wiring                                     |
| `03-team-todo`   | Full-stack multi-tenant apps | `scopedQuery`, `scopedMutation`, `definePermissions({ rules })`, `#convex/mcp`, `better-convex-nuxt/testing` |
| `04-project-board-admin` | Month-two product work | Pagination, optimistic updates, uploads, Nitro server routes, `guard`, admin workflows, integration + E2E tests |

## Important Repo Note

These apps are **reference examples**. They are intentionally **not** part of the root repo's lint, test, or typecheck commands.

That keeps the main package validation fast and avoids forcing generated Convex files for every example into CI.

## Local Run Flow

Every example is a small consumer app with its own `package.json`.

1. `cd` into the example folder.
2. Copy `.env.example` to `.env.local`.
3. Run `pnpm install`.
4. Start Convex with `npx convex dev`.
5. Start Nuxt with `pnpm dev`.

If you are running these examples from inside this repository and the local package link does not resolve yet, run `pnpm dev:prepare` once at the repo root so the package's built exports are available.

## Environment Variables

| Example          | Nuxt env vars                                         | Extra Convex/auth env vars                             |
| ---------------- | ----------------------------------------------------- | ------------------------------------------------------ |
| `01-public-todo` | `CONVEX_URL`                                          | none                                                   |
| `02-auth-todo`   | `CONVEX_URL`, `CONVEX_SITE_URL`                       | `SITE_URL`, `BETTER_AUTH_SECRET`                       |
| `03-team-todo`   | `CONVEX_URL`, `CONVEX_SITE_URL`, `CONVEX_SERVICE_KEY` | `SITE_URL`, `BETTER_AUTH_SECRET`, `CONVEX_SERVICE_KEY` |
| `04-project-board-admin` | `CONVEX_URL`, `CONVEX_SITE_URL`, `CONVEX_SERVICE_KEY` | `SITE_URL`, `BETTER_AUTH_SECRET`, `CONVEX_SERVICE_KEY` |

## Why The Code Is Comment-Heavy

These examples are meant to be read line-by-line by people evaluating the module.

That is why the code includes:

- file header comments explaining why the file exists
- inline comments at the exact points where auth, scoping, permissions, and MCP behavior become non-obvious
- very small business domains so the framework behavior is the only thing you need to learn
