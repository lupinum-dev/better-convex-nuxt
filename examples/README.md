# Runnable Examples

This folder now has two jobs:

- a progressive learning path from `01` to `04`
- a SaaS gallery from `04` to `10` that maps auth shapes to concrete runnable apps

## Which One To Open First?

| Example | Best for | Shows |
| --- | --- | --- |
| `01-public-todo` | First look | raw `query` / `mutation`, `defineArgs` |
| `02-auth-todo` | Auth-only apps | Better Auth wiring, raw Convex handlers |
| `03-team-todo` | Full-stack multi-tenant apps | `convex/auth/*`, backend-owned context, `_can`, `#convex/mcp`, `better-convex-nuxt/testing` |
| `04-project-board-admin` | Month-two product work | Project-management SaaS, pagination, optimistic updates, uploads, Nitro routes, `guard`, `_can`, admin workflows, integration + E2E tests |

## SaaS Coverage Matrix

| Example | SaaS type | Auth shape | Easy problem | Hard problem |
| --- | --- | --- | --- | --- |
| `04-project-board-admin` | Project management | role + ownership + state guards | member updates own task | archived resources and nested resource guards |
| `05-crm-pipeline` | CRM | row visibility + redaction | rep edits own contact | manager/team visibility and sensitive field redaction |
| `06-course-lms` | Course / LMS | relationship access | enrolled student reads lesson | prerequisites, publishing state, timed unlocks |
| `07-ecommerce-ops` | E-commerce back office | user + service actors | admin refunds a valid order | webhook auth, idempotency, refund-state guards |
| `08-freemium-workspace` | Freemium B2B | plan entitlements + limits | plan feature visible in UI | count-based project limits |
| `09-doc-sharing` | Collaboration / sharing | resource sharing + public tokens | workspace member views a page | inherited access and token-level enforcement |
| `10-agency-portal` | Agency / multi-client | controlled cross-tenant access | client user works inside current workspace | agency-wide dashboard across assigned clients only |

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

| Example | Nuxt env vars | Extra Convex/auth env vars |
| --- | --- | --- |
| `01-public-todo` | `CONVEX_URL` | none |
| `02-auth-todo` | `CONVEX_URL`, `CONVEX_SITE_URL` | `SITE_URL`, `BETTER_AUTH_SECRET` |
| `03-team-todo` | `CONVEX_URL`, `CONVEX_SITE_URL`, `CONVEX_SERVICE_KEY` | `SITE_URL`, `BETTER_AUTH_SECRET`, `CONVEX_SERVICE_KEY` |
| `04-project-board-admin` | `CONVEX_URL`, `CONVEX_SITE_URL`, `CONVEX_SERVICE_KEY` | `SITE_URL`, `BETTER_AUTH_SECRET`, `CONVEX_SERVICE_KEY` |
| `05-crm-pipeline` | `CONVEX_URL`, `CONVEX_SITE_URL` | `SITE_URL`, `BETTER_AUTH_SECRET` |
| `06-course-lms` | `CONVEX_URL`, `CONVEX_SITE_URL` | `SITE_URL`, `BETTER_AUTH_SECRET` |
| `07-ecommerce-ops` | `CONVEX_URL`, `CONVEX_SITE_URL`, `CONVEX_SERVICE_KEY` | `SITE_URL`, `BETTER_AUTH_SECRET`, `CONVEX_SERVICE_KEY` |
| `08-freemium-workspace` | `CONVEX_URL`, `CONVEX_SITE_URL` | `SITE_URL`, `BETTER_AUTH_SECRET` |
| `09-doc-sharing` | `CONVEX_URL`, `CONVEX_SITE_URL` | `SITE_URL`, `BETTER_AUTH_SECRET` |
| `10-agency-portal` | `CONVEX_URL`, `CONVEX_SITE_URL` | `SITE_URL`, `BETTER_AUTH_SECRET` |

## Why The Code Is Comment-Heavy

These examples are meant to be read line-by-line by people evaluating the module.

That is why the code includes:

- file header comments explaining why the file exists
- inline comments at the exact points where auth, scoping, authorization, and service/token behavior become non-obvious
- very small business domains so the framework behavior is the only thing you need to learn
