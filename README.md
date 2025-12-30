# Better Convex Nuxt

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![License][license-src]][license-href]
[![Nuxt][nuxt-src]][nuxt-href]

Full-featured [Convex](https://convex.dev) integration for [Nuxt](https://nuxt.com) with SSR, real-time subscriptions, authentication, and permissions.

- [Documentation](https://better-convex-nuxt.vercel.app)
- [Online Playground](https://stackblitz.com/github/lupinum-dev/better-convex-nuxt?file=playground%2Fapp.vue)

## Features

- **Real-time Queries** - Fetch data with SSR, then upgrade to WebSocket subscriptions
- **Optimistic Updates** - Instant UI feedback with automatic rollback on failure
- **Authentication** - Better Auth integration with email/password, OAuth, and magic links
- **Permissions** - Role-based access control with ownership rules
- **SSR Support** - Server-side rendering with hydration
- **Type Safety** - Full TypeScript inference from your Convex schema

## Quick Setup

Install the module:

```bash
npx nuxi module add better-convex-nuxt
```

Add your Convex URL to `.env`:

```bash
CONVEX_URL=https://your-project.convex.cloud
```

That's it! Start using Convex in your Nuxt app.

## Usage

### Queries

```vue
<script setup lang="ts">
import { api } from '~/convex/_generated/api'

// Real-time subscription with SSR support
const { data: tasks, status } = await useConvexQuery(
  api.tasks.list,
  { status: 'active' }
)
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

const { mutate, pending } = useConvexMutation(api.tasks.create, {
  optimisticUpdate: (localStore, args) => {
    updateQuery({
      query: api.tasks.list,
      args: {},
      localQueryStore: localStore,
      updater: (current) => current
        ? [{ _id: 'temp', text: args.text, completed: false }, ...current]
        : []
    })
  }
})

await mutate({ text: 'Ship my app' })
</script>
```

### Authentication

```vue
<script setup lang="ts">
const { isAuthenticated, user } = useConvexAuth()
const authClient = useAuthClient()

async function handleLogin() {
  await authClient.signIn.social({ provider: 'github' })
}
</script>

<template>
  <div v-if="isAuthenticated">
    Welcome, {{ user?.name }}!
  </div>
  <button v-else @click="handleLogin">
    Sign in with GitHub
  </button>
</template>
```

## Composables

| Composable                 | Description                                          |
| -------------------------- | ---------------------------------------------------- |
| `useConvexQuery`           | Execute queries with SSR and real-time subscriptions |
| `useLazyConvexQuery`       | Non-blocking queries that load in background         |
| `useConvexMutation`        | Execute mutations with optimistic updates            |
| `useConvexAction`          | Execute Convex actions                               |
| `useConvexPaginatedQuery`  | Paginated queries with `loadMore()`                  |
| `useConvexAuth`            | Authentication state (user, token, isAuthenticated)  |
| `useConvexConnectionState` | WebSocket connection status                          |
| `useConvexCached`          | Read cached query data                               |
| `useConvex`                | Access raw ConvexClient instance                     |

## Components

| Component                 | Description                                 |
| ------------------------- | ------------------------------------------- |
| `<ConvexAuthenticated>`   | Renders content only when authenticated     |
| `<ConvexUnauthenticated>` | Renders content only when not authenticated |
| `<ConvexAuthLoading>`     | Renders content during auth state loading   |

## Documentation

Visit [better-convex-nuxt.vercel.app](https://better-convex-nuxt.vercel.app) for full documentation including:

- [Installation & Setup](https://better-convex-nuxt.vercel.app/getting-started/installation)
- [SSR Patterns](https://better-convex-nuxt.vercel.app/patterns/ssr-patterns)
- [Optimistic Updates](https://better-convex-nuxt.vercel.app/patterns/optimistic-updates)
- [Permissions](https://better-convex-nuxt.vercel.app/patterns/permissions)
- [Server Utilities](https://better-convex-nuxt.vercel.app/server/server-utilities)

## Contributing

```bash
# Install dependencies
pnpm install

# Generate type stubs
pnpm dev:prepare

# Develop with the playground
pnpm dev

# Run tests
pnpm test

# Lint
pnpm lint
```

## License

[MIT](./LICENSE)

<!-- Badges -->

[npm-version-src]: https://img.shields.io/npm/v/better-convex-nuxt/latest.svg?style=flat&colorA=020420&colorB=00DC82
[npm-version-href]: https://npmjs.com/package/better-convex-nuxt
[npm-downloads-src]: https://img.shields.io/npm/dm/better-convex-nuxt.svg?style=flat&colorA=020420&colorB=00DC82
[npm-downloads-href]: https://npm.chart.dev/better-convex-nuxt
[license-src]: https://img.shields.io/npm/l/better-convex-nuxt.svg?style=flat&colorA=020420&colorB=00DC82
[license-href]: https://npmjs.com/package/better-convex-nuxt
[nuxt-src]: https://img.shields.io/badge/Nuxt-020420?logo=nuxt
[nuxt-href]: https://nuxt.com
