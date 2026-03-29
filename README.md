# Better Convex Nuxt

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![License][license-src]][license-href]
[![Nuxt][nuxt-src]][nuxt-href]

Full-featured [Convex](https://convex.dev) integration for [Nuxt](https://nuxt.com) with SSR, real-time subscriptions, authentication, file uploads, and permissions.

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

A read-only CLI proof of concept is included for consumer app checks:

```bash
npx better-convex-nuxt doctor
npx better-convex-nuxt doctor --cwd ./my-app
npx better-convex-nuxt doctor --json
```

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

## Usage

### Shared Schema DX

Shared Convex validators now have one source of truth and multiple runtime consumers:

- `better-convex-nuxt/composables` for client composables
- `better-convex-nuxt/schema` for server-safe shared schema helpers
- `better-convex-nuxt/server` for Nitro server helpers
- `better-convex-nuxt/mcp` for MCP-only helpers

This split is intentional. The goal is one validator definition reused across runtimes, not one universal import everywhere. Server files should use `better-convex-nuxt/schema`, not `better-convex-nuxt/composables`, so Nitro never pulls the client-heavy entrypoint into the server graph.

```ts
import { v } from 'convex/values'
import type { ConvexSchemaMetaFor } from 'better-convex-nuxt/schema'
import { defineConvexSchema } from 'better-convex-nuxt/schema'
import { defineConvexMcpTool } from 'better-convex-nuxt/mcp'
import { serverConvexMutation } from 'better-convex-nuxt/server'

export const createPostArgs = {
  title: v.string(),
  content: v.string(),
}

export const createPostMeta = {
  description: 'Create a post',
  fields: {
    title: { description: 'Post title' },
    content: { description: 'Post body' },
  },
} satisfies ConvexSchemaMetaFor<typeof createPostArgs>

const schema = defineConvexSchema(createPostArgs, createPostMeta)

export default defineConvexMcpTool({
  name: 'create-post',
  schema,
  handler: async (args) => {
    return await serverConvexMutation(api.posts.create, args)
  },
})
```

The same schema object is reused across the stack:

```ts
const schema = defineConvexSchema(createPostArgs, createPostMeta)

schema.args      // raw Convex validators
schema.validate  // H3/server validation
schema.meta      // optional metadata
schema.standard  // explicit StandardSchemaV1 view
schema           // also directly usable anywhere StandardSchemaV1 is accepted
```

Typical usage by runtime:

```ts
mutation({
  args: schema.args,
  handler: async (ctx, args) => {
    return await ctx.db.insert('posts', args)
  },
})

const body = schema.validate(await readBody(event))

<UForm :schema="schema" />
// or <UForm :schema="schema.standard" />
```

Metadata is optional. MCP tools still work without it, but the generated tool input only carries field names and types, not descriptions:

```ts
const schema = defineConvexSchema(createPostArgs)

export default defineConvexMcpTool({
  name: 'create-post',
  schema,
  handler: async (args) => {
    return await serverConvexMutation(api.posts.create, args)
  },
})
```

That works, but agents have less context for tool selection and argument filling. Add `meta.description` and `meta.fields.*.description` when you want MCP tools to be self-explanatory.

Hard cutovers in this release:

- `schema.toMcpInput(...)` was removed
- `defineConvexMcpTool` moved from `better-convex-nuxt/server` to `better-convex-nuxt/mcp`
- server-safe shared schema imports should use `better-convex-nuxt/schema`
- `ConvexSchemaMeta` remains as a compatibility alias for the base metadata type

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

| Hook | Fires When |
| --- | --- |
| `convex:mutation:success` | A mutation completes successfully |
| `convex:mutation:error` | A mutation fails |
| `convex:action:success` | An action completes successfully |
| `convex:action:error` | An action fails |
| `convex:unauthorized` | Unauthorized recovery is triggered for a Convex call |
| `convex:connection:changed` | The derived connection phase changes (`connecting`, `connected`, `reconnecting`) |
| `convex:auth:changed` | The effective authenticated user changes |
| `better-convex:auth:refresh` | Internal auth refresh runs |

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
