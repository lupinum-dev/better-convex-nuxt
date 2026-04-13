# Trellis

The full-stack Convex toolkit for Nuxt: SSR, real-time subscriptions, auth, permissions, and AI agent integration in one module.

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![License][license-src]][license-href]
[![Nuxt][nuxt-src]][nuxt-href]

- [Documentation](https://trellis.vercel.app)
- [Examples](./examples/README.md)
- [Public demo app](./demo)

## Why?

- **One set of business rules.** Whether a request comes from a browser, a server route, or an AI agent, it hits the same Convex handlers with the same permission checks. Transport changes; authorization does not.
- **Future-proof agent seam.** MCP is one adapter, not the business layer. Future agent protocols should still resolve a principal and call the same root internal Convex refs.
- **Structural safety.** A handler without a guard is a type error, not a code review catch. Tenant isolation is declared once, not checked in every query.
- **Framework-owned infrastructure.** Auth wiring, SSR hydration, real-time subscriptions, and MCP protocol handling are built in. Your roles, business rules, and data model are your code — not configuration.
- **Progressive disclosure.** A public todo app is one config line. Adding auth is one flag. Adding protected operations, component bridges, or MCP tools is one more layer, not a rewrite.

## Features

- SSR with hydration to real-time WebSocket subscriptions
- Cursor-based pagination with `loadMore()`
- Better Auth integration for identity, sessions, OAuth, email/password, and magic links
- Route protection and auth middleware
- File uploads with progress tracking and queue management
- Permission system with guards, actors, capabilities, and `_can`
- Protected backend runtime with `createApp(...)` — guards and authorization built into every handler
- `defineOperation(...)` and `previewOf(...)` for reusable protected business definitions
- `createComponentBridge(...)` for forwarding identity into Convex components
- `defineMcpRuntime(...)` and `projectTool(...)` for exposing business logic to AI agents
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

### Protected Handler Example

```ts
// convex/todos.ts
export const create = app.mutation({
  args: createTodo.args,
  guard: canCreateTodo,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    return await ctx.db.insert('todos', {
      title: args.title,
      completed: false,
      ownerId: actor.userId,
    })
  },
})
```

### MCP Tool Example

```ts
// server/mcp/tools/create-todo.ts
export default projectTool({
  schema: createTodo,
  call: api.todos.create,
  capability: 'createTodo',
  meta: {
    name: 'create-todo',
    description: 'Create a new todo item.',
  },
})
```

## Architecture References

- `examples/03-team-workspace`: single-workspace protected app
- `examples/07-mcp-reference`: full MCP feature reference
- `examples/08-component-mini-cms`: component bridge + MCP projection architecture

## Where To Go Next

- [Get Started](https://trellis.vercel.app/docs/guide/get-started)
- [How It Works](https://trellis.vercel.app/docs/guide/how-it-works)
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

These commands generate plain app-owned files such as `convex/auth/principal.ts`,
`convex/auth/actor.ts`, `convex/functions.ts`, and `server/mcp/runtime.ts`. Edit them directly.

## Contributing

```bash
corepack pnpm install
pnpm dev
pnpm check
pnpm check:cli
pnpm test
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
