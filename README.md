# Better Convex Nuxt

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![License][license-src]][license-href]
[![Nuxt][nuxt-src]][nuxt-href]

Full-featured [Convex](https://convex.dev) integration for [Nuxt](https://nuxt.com) with SSR, real-time subscriptions, authentication, file uploads, permissions, server helpers, and MCP tooling.

- [Documentation](https://better-convex-nuxt.vercel.app)
- [Examples](./examples/README.md)
- [Public demo app](./demo)

## Install

```bash
pnpm add convex better-convex-nuxt
```

If you use MCP tools with shared Convex schemas:

```bash
pnpm add @nuxtjs/mcp-toolkit convex-helpers zod
```

## Quick Start

Add the module to `nuxt.config.ts` and point it at your Convex deployment:

```ts
export default defineNuxtConfig({
  modules: ['better-convex-nuxt'],
  convex: {
    url: process.env.CONVEX_URL,
  },
})
```

Use `.env.local` when running Nuxt locally:

```json
{
  "scripts": {
    "dev": "nuxt dev --dotenv .env.local",
    "build": "nuxt build --dotenv .env.local",
    "typecheck": "nuxt typecheck --dotenv .env.local"
  }
}
```

### Query Example

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

### Auth Example

```vue
<script setup lang="ts">
const { client, isAuthenticated, user } = useConvexAuth()

async function signInWithGitHub() {
  await client?.signIn.social({ provider: 'github' })
}
</script>
```

## Package Surface

Published npm entrypoints:

- `better-convex-nuxt`
- `better-convex-nuxt/auth`
- `better-convex-nuxt/args`
- `better-convex-nuxt/composables`
- `better-convex-nuxt/functions`
- `better-convex-nuxt/mcp`
- `better-convex-nuxt/server`
- `better-convex-nuxt/testing`
- `better-convex-nuxt/trusted-caller`
- `better-convex-nuxt/visibility`

Nuxt-generated surfaces:

- `#convex/mcp`
- `#convex/server`
- server auto-imports such as `serverConvexClearAuthCache` and `validateConvexArgs`
- config-driven auto-imports such as `usePermissions()` and `useAuthGuard()`

Those Nuxt-generated surfaces are not npm subpath exports. The generated reference lives at [API Surface](https://better-convex-nuxt.vercel.app/docs/api-reference/api-surface).

## CLI

The package ships a small CLI for consumer checks and scaffolding:

```bash
npx better-convex-nuxt doctor
npx better-convex-nuxt doctor --cwd ./my-app
npx better-convex-nuxt doctor --json
npx better-convex-nuxt init auth
npx better-convex-nuxt init permissions --model workspace
npx better-convex-nuxt init permissions --model workspace-mcp
npx better-convex-nuxt init mcp
```

## Where To Go Next

- [Get Started](https://better-convex-nuxt.vercel.app/docs/guide/get-started)
- [Authentication](https://better-convex-nuxt.vercel.app/docs/auth-security/authentication)
- [Permissions](https://better-convex-nuxt.vercel.app/docs/permissions/setup)
- [Server Side](https://better-convex-nuxt.vercel.app/docs/server-side/ssr-overview)
- [MCP Tools](https://better-convex-nuxt.vercel.app/docs/mcp-tools/getting-started)
- [Testing](https://better-convex-nuxt.vercel.app/docs/testing/getting-started)
- [Module Options](https://better-convex-nuxt.vercel.app/docs/configuration/module-options)
- [Deployment Overview](https://better-convex-nuxt.vercel.app/docs/deployment/overview)

## Contributing

```bash
pnpm install
pnpm dev:prepare
pnpm dev
pnpm test
pnpm lint
```

Maintainer notes live in [DEVELOPMENT.md](./DEVELOPMENT.md).

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
