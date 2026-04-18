# Trellis

Trellis is the Nuxt module for Convex apps that want one app-owned business layer across browser, server, and agent callers.

It combines four concerns that usually drift apart:

- Nuxt SSR and client composables
- Convex queries, mutations, actions, and protected handlers
- Better Auth integration and actor resolution
- MCP projection over the same backend model

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![License][license-src]][license-href]
[![Nuxt][nuxt-src]][nuxt-href]

- [Documentation](https://trellis.vercel.app)
- [Examples](./examples/README.md)
- [Public demo app](./demo)
- [Design direction](./SPEC.vNext.md)

## What Trellis Adds

- One protected backend pipeline: principal, optional `authenticated`, actor, guard, load, authorize, handler.
- One permission model reused by browser UI, Nitro routes, webhooks, and MCP tools.
- Nuxt composables for SSR, live queries, optimistic updates, uploads, and auth state.
- A structured operation model for preview and confirm flows around destructive work.
- Semantic observability for Trellis decisions with correlation and evlog delivery.
- Installers and a CLI for common setup checks and scaffolding.

## Smallest Useful Setup

Requires **Nuxt 4** and **Node 18+**.

```bash
pnpm add convex @lupinum/trellis
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@lupinum/trellis'],
  trellis: {
    url: process.env.CONVEX_URL,
  },
})
```

```vue
<script setup lang="ts">
import { api } from '#trellis/api'

const { data: tasks, status } = await useConvexQuery(api.tasks.list, {
  status: 'active',
})
</script>

<template>
  <div v-if="status === 'pending'">Loading...</div>
  <ul v-else-if="status === 'success'">
    <li v-for="task in tasks" :key="task._id">
      {{ task.text }}
    </li>
  </ul>
</template>
```

That is the narrow on-ramp: install the module, point it at Convex, and render one query. Add auth, permissions, or MCP only when the app actually needs them.

## Example Ladder

Start with these in order:

1. [`examples/01-public-todo`](./examples/01-public-todo/README.md): smallest public-only app
2. [`examples/02-auth-todo`](./examples/02-auth-todo/README.md): personal auth app with actors
3. [`examples/03-team-workspace`](./examples/03-team-workspace/README.md): canonical protected workspace app

Use these when you need deeper reference:

- [`examples/07-mcp-reference`](./examples/07-mcp-reference/README.md): MCP surface and tool patterns
- [`examples/08-component-mini-cms`](./examples/08-component-mini-cms/README.md): component bridge and projection boundaries
- [`examples-next`](./examples-next/README.md): pressure suite for future direction, not the default public source of truth

## CLI

Use the CLI to validate setup or scaffold app-owned files:

```bash
npx trellis doctor
npx trellis init auth
npx trellis init permissions --model workspace
npx trellis init mcp
```

The generated files are plain app code. Edit them directly.

## Package Surface

Published npm entrypoints:

- `@lupinum/trellis`
- `@lupinum/trellis/auth`
- `@lupinum/trellis/args`
- `@lupinum/trellis/composables`
- `@lupinum/trellis/functions`
- `@lupinum/trellis/mcp`
- `@lupinum/trellis/server`
- `@lupinum/trellis/testing`
- `@lupinum/trellis/trusted-caller`
- `@lupinum/trellis/visibility`
- `@lupinum/trellis/eslint`

Nuxt also generates app-local surfaces such as `#trellis/api`, `#trellis/server`, `#trellis/mcp`, and module-driven auto-imports.

## Contributing

```bash
corepack pnpm install
pnpm dev
```

[npm-version-src]: https://img.shields.io/npm/v/@lupinum/trellis/latest.svg?style=flat&colorA=18181B&colorB=28CF8D
[npm-version-href]: https://npmjs.com/package/@lupinum/trellis
[npm-downloads-src]: https://img.shields.io/npm/dm/@lupinum/trellis.svg?style=flat&colorA=18181B&colorB=28CF8D
[npm-downloads-href]: https://npm.chart.dev/@lupinum/trellis
[license-src]: https://img.shields.io/npm/l/@lupinum/trellis.svg?style=flat&colorA=18181B&colorB=28CF8D
[license-href]: https://npmjs.com/package/@lupinum/trellis
[nuxt-src]: https://img.shields.io/badge/Nuxt-4.x-00DC82?style=flat&logo=nuxt.js&logoColor=white
[nuxt-href]: https://nuxt.com
