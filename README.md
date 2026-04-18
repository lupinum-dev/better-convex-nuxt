# Trellis

Trellis is an opinionated app platform for building repeated `Nuxt + Convex + Better Auth + MCP` apps on one shared backend model.

It is for teams that want to ship many apps on the same stack without re-solving the same wiring every time:

- Nuxt SSR and client composables
- Convex queries, mutations, actions, and protected handlers
- Better Auth integration and actor resolution
- MCP projection over the same backend model

Trellis is not trying to be neutral or minimal. It is the strong-default path for apps that want app-owned auth, tenancy, permissions, operations, and agent support without rebuilding that architecture per project.

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![License][license-src]][license-href]
[![Nuxt][nuxt-src]][nuxt-href]

- [Documentation](https://trellis.vercel.app)
- [Examples](./examples/README.md)
- [Public demo app](./demo)
- [Design direction](./SPEC-FINAL.md)

## What Trellis Adds

- One protected backend pipeline: principal, optional `authRequired`, actor, guard, load, authorize, handler.
- One permission model reused by browser UI, Nitro routes, webhooks, and MCP tools.
- Nuxt composables for SSR, live queries, optimistic updates, uploads, and auth state.
- A structured operation model for preview and confirm flows around destructive work.
- Semantic observability for Trellis decisions with correlation and evlog delivery.
- Installers and a CLI for setup checks, app scaffolding, and repeated app conventions.

## First Success

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

That is the first visible win: install the module, point it at Convex, and render one query. From there, Trellis scales into app-owned auth, permissions, operations, and MCP without changing the basic shape of the app.

## Product Surfaces

Trellis has three distinct surfaces. They are not interchangeable:

- `trellis init app --template personal|workspace|workspace-mcp|cms` are the official starters.
- [`examples`](./examples/README.md) are runnable learning and reference apps.
- [`examples-next`](./examples-next/README.md) is the pressure suite for future archetypes, not the default public source of truth.

The product is the starter-plus-runtime path. Examples support that path; they do not replace it.

## Example Ladder

Start with these in order:

1. [`examples/01-public-todo`](./examples/01-public-todo/README.md): smallest public-only app
2. [`examples/02-auth-todo`](./examples/02-auth-todo/README.md): personal auth app with actors
3. [`examples/03-team-workspace`](./examples/03-team-workspace/README.md): canonical protected workspace app

Use these when you need deeper reference:

- [`examples/07-mcp-reference`](./examples/07-mcp-reference/README.md): MCP surface and tool patterns
- [`examples/08-component-mini-cms`](./examples/08-component-mini-cms/README.md): component bridge and projection boundaries
- [`examples-next`](./examples-next/README.md): pressure suite for future direction, not the default public source of truth

## Templates vs Examples

The current official starters are:

- `personal`
- `workspace`
- `workspace-mcp`
- `cms`

Promotion path:

1. A shape proves itself as an example or real app.
2. The shape converges on the canonical Trellis layout.
3. The repeated boilerplate becomes generator-worthy.
4. The shape graduates into an official CLI template.

Current promotion candidates are:

- `support-inbox`
- `agent-console`

## CLI

Use the CLI to validate setup or scaffold app-owned files:

```bash
npx trellis doctor
npx trellis init app --template personal
npx trellis init app --template workspace
npx trellis init app --template workspace-mcp
npx trellis init app --template cms
npx trellis init auth
npx trellis init permissions --model workspace
npx trellis init mcp
```

`init app` is the primary entrypoint. It bootstraps a coherent starter inside the current app root. The feature-level `init auth`, `init permissions`, and `init mcp` commands still exist when you need to add a slice onto an already-shaped app.

The generated app shape is now deliberate: auth lives under `convex/auth/`, feature modules under `convex/domain/`, permission projection under `convex/permissions/`, workflow actions under `convex/operations/`, and shared contracts under `shared/schemas/`.

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
