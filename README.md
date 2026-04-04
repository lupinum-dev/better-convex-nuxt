# Trellis

The full-stack Convex toolkit for Nuxt — SSR, real-time subscriptions, auth, permissions, and MCP in one module.

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![License][license-src]][license-href]
[![Nuxt][nuxt-src]][nuxt-href]

- [Documentation](https://trellis.vercel.app)
- [Examples](./examples/README.md)
- [Public demo app](./demo)

## Why?

- **Structural safety.** A handler without a guard is a type error, not a code review catch. Tenant isolation is declared once, not checked in every query.
- **Composable primitives.** `useConvexQuery`, `useConvexMutation`, `usePermissions`, `defineGuard`, `defineActor` — each does one thing and composes with everything.
- **Owned code.** The module provides the hard primitives (auth wiring, SSR hydration, real-time subscriptions, trusted caller detection). Your roles, business rules, and data model are your code, not config.
- **Progressive disclosure.** A public todo app is one config line. Adding auth is one flag. Adding tenant isolation is one declaration. Adding MCP tools is one more module. No cliffs.

## Features

- SSR with hydration to real-time WebSocket subscriptions
- Cursor-based pagination with `loadMore()`
- Better Auth integration for identity, sessions, OAuth, email/password, and magic links
- Route protection and auth middleware
- File uploads with progress tracking and queue management
- Permission system with guards, actors, and capabilities
- Visibility and field-level redaction
- Server-side queries, mutations, and actions via Nitro
- Trusted caller infrastructure for server-to-server auth
- MCP tool definitions with shared schemas
- Vue DevTools integration
- First-class testing utilities
- ESLint plugin

## Quick Start

Requires **Nuxt 4** and **Node 18+**.

```bash
pnpm add convex @lupinum/trellis
```

Add the module to `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: ['@lupinum/trellis'],
  trellis: {
    url: process.env.CONVEX_URL,
  },
})
```

### Query Example

```vue
<script setup lang="ts">
import { api } from '#trellis/api'

// SSR-rendered on first load, then live WebSocket updates — no refetch needed
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

### Mutation with Optimistic Update

```vue
<script setup lang="ts">
import { api } from '#trellis/api'

const addNote = useConvexMutation(api.notes.add, {
  optimisticUpdate: (ctx, args) => {
    ctx.query(api.notes.list, {}).update(notes => [...notes, { ...args, _id: 'temp' }])
  },
})

await addNote({ title: 'Ship it' })
</script>
```

### Permissions Example

```ts
// convex/posts.ts
export const remove = app.mutation({
  args: { id: v.id('posts') },
  guard: can('post.delete'),
  load: (ctx, args) => loadTenantResource(ctx.actor, ctx.db, 'posts', args.id),
  handler: async (ctx, _args, post) => {
    await ctx.db.delete(post._id)
  },
})
```

## Where To Go Next

- [Get Started](https://trellis.vercel.app/docs/guide/get-started)
- [Authentication](https://trellis.vercel.app/docs/auth-security/authentication)
- [Permissions](https://trellis.vercel.app/docs/permissions/setup)
- [Server Side](https://trellis.vercel.app/docs/server-side/ssr-overview)
- [MCP Tools](https://trellis.vercel.app/docs/mcp-tools/getting-started)
- [Testing](https://trellis.vercel.app/docs/testing/getting-started)
- [Module Options](https://trellis.vercel.app/docs/configuration/module-options)
- [Deployment Overview](https://trellis.vercel.app/docs/deployment/overview)

## Package Surface

Published npm entrypoints:

- `@lupinum/trellis`
- `@lupinum/trellis/auth`
- `@lupinum/trellis/args`
- `@lupinum/trellis/composables`
- `@lupinum/trellis/eslint`
- `@lupinum/trellis/functions`
- `@lupinum/trellis/mcp`
- `@lupinum/trellis/server`
- `@lupinum/trellis/testing`
- `@lupinum/trellis/trusted-caller`
- `@lupinum/trellis/visibility`

Nuxt-generated surfaces:

- `#trellis/mcp`
- `#trellis/server`
- server auto-imports such as `serverConvexClearAuthCache` and `validateConvexArgs`
- config-driven auto-imports such as `usePermissions()` and `useAuthGuard()`

Those Nuxt-generated surfaces are not npm subpath exports. The generated reference lives at [API Surface](https://trellis.vercel.app/docs/api-reference/api-surface).

## ESLint

Flat config only for the first release:

```ts
import bcn from '@lupinum/trellis/eslint'

export default [
  bcn.configs.recommended,
  // bcn.configs.strict,
]
```

## CLI

The package ships a small CLI for consumer checks and scaffolding:

```bash
npx trellis doctor
npx trellis doctor --cwd ./my-app
npx trellis doctor --json
npx trellis init auth
npx trellis init permissions --model workspace
npx trellis init permissions --model workspace-mcp
npx trellis init mcp
```

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

[npm-version-src]: https://img.shields.io/npm/v/%40lupinum%2Ftrellis/latest.svg?style=flat&colorA=020420&colorB=00DC82
[npm-version-href]: https://npmjs.com/package/@lupinum/trellis
[npm-downloads-src]: https://img.shields.io/npm/dm/%40lupinum%2Ftrellis.svg?style=flat&colorA=020420&colorB=00DC82
[npm-downloads-href]: https://npm.chart.dev/@lupinum/trellis
[license-src]: https://img.shields.io/npm/l/%40lupinum%2Ftrellis.svg?style=flat&colorA=020420&colorB=00DC82
[license-href]: https://npmjs.com/package/@lupinum/trellis
[nuxt-src]: https://img.shields.io/badge/Nuxt-020420?logo=nuxt
[nuxt-href]: https://nuxt.com
