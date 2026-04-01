# Better Convex Nuxt

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![License][license-src]][license-href]
[![Nuxt][nuxt-src]][nuxt-href]

Full-featured [Convex](https://convex.dev) integration for [Nuxt](https://nuxt.com) with SSR, real-time subscriptions, authentication, file uploads, and authorization primitives.

- [Documentation](https://better-convex-nuxt.vercel.app)

> [!NOTE]
> This module is evolving quickly. Prefer the hosted docs for the latest setup and deployment guidance.

## Install

```bash
pnpm add convex better-convex-nuxt
```

If you use MCP tools with shared Convex schemas, install the MCP-only peers as well:

```bash
pnpm add @nuxtjs/mcp-toolkit convex-helpers zod
```

## CLI

A CLI is included for consumer app checks, auth starters, and additive auth blocks:

```bash
npx better-convex-nuxt doctor
npx better-convex-nuxt doctor --cwd ./my-app
npx better-convex-nuxt doctor --json
npx better-convex-nuxt add --list
npx better-convex-nuxt add auth
npx better-convex-nuxt add auth --starter workspace
npx better-convex-nuxt add auth:crm
```

`add auth` is now a starter chooser. Use `--starter personal`, `--starter workspace`, or
`--starter workspace-mcp` for non-interactive runs. Use `add auth:<block>` for additive vertical
helpers like CRM, LMS, or freemium blocks.

The `doctor` command checks:

- Nuxt app structure (`package.json` + `nuxt.config.*`)
- `nuxt`, `better-convex-nuxt`, and `convex` dependencies
- Nuxt module registration in `modules`
- Convex URL presence via `CONVEX_URL`, `NUXT_PUBLIC_CONVEX_URL`, `.env.local`, or `.env`

## Quick Start

1. Add the module to `nuxt.config.ts`.
2. Run `npx convex dev` to create your Convex project and generate `.env.local`.
3. Start Nuxt with `--dotenv .env.local`.

```ts
export default defineNuxtConfig({
  modules: ['better-convex-nuxt'],
  convex: {
    url: process.env.CONVEX_URL,
  },
})
```

```json
{
  "scripts": {
    "dev": "nuxt dev --dotenv .env.local",
    "build": "nuxt build --dotenv .env.local",
    "typecheck": "nuxt typecheck --dotenv .env.local"
  }
}
```

## Examples

If you want runnable reference apps instead of copy-paste snippets, start in [examples/README.md](./examples/README.md).

It includes standalone apps that now demonstrate the raw v4 auth model in two ways:

- a progressive path from public -> auth -> tenant scoping -> project-management product work
- a SaaS gallery covering project management, CRM, LMS, e-commerce, freemium, collaboration sharing, and agency/multi-client auth shapes

If you're jumping in by product type instead of reading linearly:

- project or task tools: start with `04-project-board-admin`
- CRM or case-management tools: start with `05-crm-pipeline`
- learning products: start with `06-course-lms`
- webhook-heavy back offices: start with `07-ecommerce-ops`
- plan-gated B2B tools: start with `08-freemium-workspace`
- doc sharing or public-link products: start with `09-doc-sharing`
- agency or multi-client portals: start with `10-agency-portal`

## Testing

The testing surface is intentionally small. It wraps `convex-test`, seeds tenant-aware fixtures,
and lets browser, service, and MCP-style calls hit the same Convex functions.

```ts
import { defineConfig } from 'vitest/config'
import { convexTestConfig } from 'better-convex-nuxt/testing'

export default defineConfig(convexTestConfig())
```

```ts
import { createTestContext } from 'better-convex-nuxt/testing'
import schema from './schema'
import { modules } from './test.setup'

const ctx = createTestContext({ schema, modules })
const team = await ctx.seedTenant({
  name: 'Acme',
  users: {
    alice: { role: 'owner' },
    bob: { role: 'member' },
  },
})
```

Use `ctx.asService(...)` when you want to verify the hidden service-auth path directly.

Keep `convex/test.setup.ts` in app code. The Vite module glob and the generated-server mock need to
live in the consumer app, but the file itself is now just the standard bridge:

```ts
/// <reference types="vite/client" />

import { vi } from 'vitest'
import { convexServerMock, createConvexTestModules } from 'better-convex-nuxt/testing'

export const modules = createConvexTestModules(
  import.meta.glob('./**/*.ts', {
    eager: false,
  }),
)

vi.mock('./_generated/server', async () => await convexServerMock())
```

## Usage

### Shared Schema DX

Shared args definitions now have one source of truth and multiple runtime consumers:

- `better-convex-nuxt/composables` for client composables
- `better-convex-nuxt/schema` for server-safe shared args helpers
- `better-convex-nuxt/server` for Nitro server helpers
- `better-convex-nuxt/mcp` for MCP-only helpers

This split is intentional. The goal is one args definition reused across runtimes, not one universal import everywhere. Server files should use `better-convex-nuxt/schema`, not `better-convex-nuxt/composables`, so Nitro never pulls the client-heavy entrypoint into the server graph.

```ts
import { v } from 'convex/values'
import { defineArgs } from 'better-convex-nuxt/schema'

export const createPost = defineArgs({
  description: 'Create a post',
  args: {
    title: v.string(),
    content: v.string(),
  },
  meta: {
    title: { description: 'Post title' },
    content: { description: 'Post body' },
  },
})
```

The same object is reused across the stack:

```ts
createPost.args // public input fields only
createPost.parse // runtime validation
createPost.meta // labels + descriptions for tools/forms
createPost.zod // Zod view
createPost.description // top-level description
```

Typical usage by runtime:

```ts
import { mutation } from './_generated/server'
import { defineTool } from '#convex/mcp'
import { authorize, withTrustedCaller } from 'better-convex-nuxt/auth'

export const create = mutation({
  args: withTrustedCaller(createPost.args),
  handler: async (ctx, args) => {
    const actor = await getActor(ctx, args)
    authorize(actor, 'Create post', canCreatePost)
    return await ctx.db.insert('posts', {
      title: args.title,
      content: args.content,
      ownerId: actor.userId,
      workspaceId: actor.tenantId,
    })
  },
})

export default defineTool({
  schema: createPost,
  auth: 'required',
  handler: async (args, ctx) => {
    const id = await serverConvexMutation(api.posts.create, args)
    return ctx.ok({ id }, `Created post "${args.title}"`)
  },
})
```

Inside Convex functions, use the validator view directly:

```ts
import { mutation } from './_generated/server'
import { authorize, withTrustedCaller } from 'better-convex-nuxt/auth'
import { canCreatePost } from './auth/checks'
import { getActor } from './auth/actor'

export const create = mutation({
  args: withTrustedCaller(createPost.args),
  handler: async (ctx, args) => {
    const actor = await getActor(ctx, args)
    authorize(actor, 'Create post', canCreatePost)
    return await ctx.db.insert('posts', {
      title: args.title,
      content: args.content,
      ownerId: actor.userId,
      workspaceId: actor.tenantId,
    })
  },
})
```

Metadata is optional. Tools still work without it, but agents get better help when fields have descriptions and examples.

Use a `shared/` directory when both Convex files and Nuxt server files need the same args definitions. That folder is a runtime boundary, not a framework convention.

The same idea applies to `composables/usePermissions.ts`: it is intentionally tiny so Nuxt can
auto-import the finished `usePermissions()` composable while your app keeps control of which
permission-context query it uses through `createAuth()`.

### Queries

```vue
<script setup lang="ts">
import { api } from '~/convex/_generated/api'

const { data: tasks, status } = await useConvexQuery(api.tasks.list, { status: 'active' })
</script>

<template>
  <ul v-if="status === 'success'">
    <li v-for="task in tasks" :key="task._id">
      {{ task.text }}
    </li>
  </ul>
</template>
```

### Mutations

```vue
<script setup lang="ts">
import { api } from '~/convex/_generated/api'

const { execute } = useConvexMutation(api.tasks.create, {
  optimisticUpdate: (localStore, args) => {
    updateQuery({
      query: api.tasks.list,
      args: {},
      store: localStore,
      updater: (current) =>
        current ? [{ _id: 'temp', text: args.text, completed: false }, ...current] : [],
    })
  },
})

await execute({ text: 'Ship my app' })
</script>
```

### Authentication

```vue
<script setup lang="ts">
const { $auth } = useNuxtApp()
const { isAuthenticated, user } = useConvexAuth()

async function handleLogin() {
  await $auth.signIn.social({ provider: 'github' })
}
</script>

<template>
  <div v-if="isAuthenticated">Welcome, {{ user?.name }}!</div>
  <button v-else @click="handleLogin">Sign in with GitHub</button>
</template>
```

## Where Env Vars Go

For most apps:

- `CONVEX_URL`: set in the Nuxt app environment or read in `nuxt.config.ts`
- `CONVEX_SITE_URL`: optional override only when auto-derivation is not correct
- `SITE_URL`: set in Convex Dashboard for Better Auth redirects/callbacks
- `BETTER_AUTH_SECRET`: set in Convex Dashboard when auth is enabled

The full matrix, including `NUXT_PUBLIC_CONVEX_URL`, `NUXT_PUBLIC_CONVEX_SITE_URL`, provider credentials, `REDIS_URL`, and `JWKS`, lives here:

- [Environment Matrix](https://better-convex-nuxt.vercel.app/docs/deployment/environment-matrix)
- [Local Development](https://better-convex-nuxt.vercel.app/docs/deployment/local-development)

## Local Development

If you want fixed localhost Convex URLs during Nuxt development, wire the local backend through
`convex-vite-plugin` and keep hosted Convex values in `.env.local` as the default mode. This is an
optional dev-only dependency for playground/local DX. It does not affect the published module
runtime.

```ts
import { convexLocal } from 'convex-vite-plugin'

const useLocalConvex = process.env.USE_LOCAL_CONVEX === 'true'
const localConvexUrl = 'http://127.0.0.1:3210'
const localConvexSiteUrl = 'http://127.0.0.1:3211'
const appUrl = process.env.SITE_URL || 'http://localhost:3000'

export default defineNuxtConfig({
  modules: ['better-convex-nuxt'],
  convex: {
    url: useLocalConvex ? localConvexUrl : process.env.CONVEX_URL,
    siteUrl: useLocalConvex ? localConvexSiteUrl : process.env.CONVEX_SITE_URL,
  },
  hooks: {
    'vite:extendConfig': (config, { isClient }) => {
      if (!useLocalConvex || !isClient) return
      config.plugins = [
        ...(config.plugins ?? []),
        convexLocal({
          port: 3210,
          siteProxyPort: 3211,
          projectDir: '.',
          convexDir: 'convex',
          envVars: {
            SITE_URL: appUrl,
            AUTH_BASE_URL: process.env.AUTH_BASE_URL || appUrl,
            AUTH_TRUSTED_ORIGINS: process.env.AUTH_TRUSTED_ORIGINS || appUrl,
            BETTER_AUTH_SECRET:
              process.env.BETTER_AUTH_SECRET || 'local-dev-better-auth-secret-not-for-production',
          },
        }),
      ]
    },
  },
})
```

In local mode the Nuxt auth proxy and `serverConvex*` helpers still talk to `convex.siteUrl`; the
only difference is that `convex.siteUrl` now points at the local HTTP Actions proxy instead of a
hosted `.convex.site` domain.

The privileged reference lane shown in the playground is also opt-in. `pnpm dev:local` enables it
with a playground-only key for demo purposes. Plain `pnpm dev` leaves that backend-only lane
disabled unless you explicitly configure matching bridge keys in both the Nuxt server runtime and
the Convex backend env.

## Runtime Hooks

The module emits a small set of Nuxt runtime hooks for cross-cutting side effects like analytics,
global error handling, auth reactions, and connection banners.

| Hook                         | Fires When                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------- |
| `convex:mutation:success`    | A mutation completes successfully                                                |
| `convex:mutation:error`      | A mutation fails                                                                 |
| `convex:action:success`      | An action completes successfully                                                 |
| `convex:action:error`        | An action fails                                                                  |
| `convex:unauthorized`        | Unauthorized recovery is triggered for a Convex call                             |
| `convex:connection:changed`  | The derived connection phase changes (`connecting`, `connected`, `reconnecting`) |
| `convex:auth:changed`        | The effective authenticated user changes                                         |
| `better-convex:auth:refresh` | Internal auth refresh runs                                                       |

Full docs: [Runtime Hooks](https://better-convex-nuxt.vercel.app/docs/api-reference/runtime-hooks)

```ts
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('convex:connection:changed', ({ state, previousState }) => {
    console.log(`Convex connection ${previousState} -> ${state}`)
  })

  nuxtApp.hook('convex:auth:changed', ({ isAuthenticated, user }) => {
    console.log('Auth changed:', isAuthenticated, user?.id)
  })
})
```

## Docs

- [Getting Started](https://better-convex-nuxt.vercel.app/docs/guide/get-started)
- [Authentication Reference](https://better-convex-nuxt.vercel.app/docs/auth-security/authentication)
- [Server Call Lanes](https://better-convex-nuxt.vercel.app/docs/server-side/server-call-lanes)
- [Permissions Setup](https://better-convex-nuxt.vercel.app/docs/auth-security/permissions-setup)
- [Server Routes](https://better-convex-nuxt.vercel.app/docs/server-side/server-routes)
- [System Workloads: Private Bridge](https://better-convex-nuxt.vercel.app/docs/recipes/system-workloads-private-bridge)
- [Module Configuration](https://better-convex-nuxt.vercel.app/docs/advanced/module-config)
- [Deployment Overview](https://better-convex-nuxt.vercel.app/docs/deployment/overview)

## Contributing

```bash
pnpm install
pnpm dev:prepare
pnpm dev
pnpm dev:local
pnpm test
pnpm lint
```

Maintainer setup notes live in [DEVELOPMENT.md](./DEVELOPMENT.md).

## License

[MIT](./LICENSE)

[npm-version-src]: https://img.shields.io/npm/v/better-convex-nuxt/latest.svg?style=flat&colorA=020420&colorB=00DC82
[npm-version-href]: https://npmjs.com/package/better-convex-nuxt
[npm-downloads-src]: https://img.shields.io/npm/dm/better-convex-nuxt.svg?style=flat&colorA=020420&colorB=00DC82
[npm-downloads-href]: https://npm.chart.dev/better-convex-nuxt
[license-src]: https://img.shields.io/npm/l/better-convex-nuxt.svg?style=flat&colorA=020420&colorB=00DC82
[license-href]: https://npmjs.com/package/better-convex-nuxt
[nuxt-src]: https://img.shields.io/badge/Nuxt-020420?logo=nuxt
[nuxt-href]: https://nuxt.com
