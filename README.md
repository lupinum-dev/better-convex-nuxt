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
const { isAuthenticated, user, signIn } = useConvexAuth()

async function handleLogin() {
  await signIn.social({ provider: 'github' })
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

## Docs

- [Getting Started](https://better-convex-nuxt.vercel.app/docs/guide/get-started)
- [Authentication Reference](https://better-convex-nuxt.vercel.app/docs/auth-security/authentication)
- [Permissions Setup](https://better-convex-nuxt.vercel.app/docs/auth-security/permissions-setup)
- [Server Routes](https://better-convex-nuxt.vercel.app/docs/server-side/server-routes)
- [Module Configuration](https://better-convex-nuxt.vercel.app/docs/advanced/module-config)
- [Deployment Overview](https://better-convex-nuxt.vercel.app/docs/deployment/overview)

## Contributing

```bash
pnpm install
pnpm dev:prepare
pnpm dev
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
