---
title: 'Convex for Nuxt, without the integration glue.'
navigation: false
description: 'SSR-ready realtime queries, Better Auth, typed server calls, optimistic updates, and file uploads for Nuxt 4.'
---

## ::u-page-hero

orientation: 'horizontal'
description: Build on Convex from Nuxt 4 with one coherent client, server, SSR, realtime, and authentication model.
ui:
container: 'lg:items-start flex flex-col lg:grid pt-24 sm:pt-32 lg:pt-40 pb-0 sm:pb-0 lg:pb-0 gap-16 sm:gap-y-0'

---

#title
Convex for Nuxt, [without the integration glue]{.text-primary}
#links
:::u-button

---

size: lg
to: /docs/get-started/choose-your-path
color: warning
trailing-icon: i-lucide-arrow-right

---

Get started
:::
:u-input-copy{value="pnpm add better-convex-nuxt convex@1.42.1 better-auth@1.6.23 @convex-dev/better-auth@0.12.5"}
#default
::tabs{class="xl:-mt-10 bg-white dark:bg-neutral-900"}
:::tabs-item{label="Query" icon="i-lucide-radio"}

```vue
<script setup lang="ts">
import { api } from '#convex/api'

const { data: tasks, status } = await useConvexQuery(api.tasks.list, {})
</script>

<template>
  <p v-if="status === 'pending'">Loading tasks…</p>
  <ul v-else>
    <li v-for="task in tasks" :key="task._id">
      {{ task.text }}
    </li>
  </ul>
</template>
```

:::
:::tabs-item{label="Write" icon="i-lucide-pen-line"}

```vue
<script setup lang="ts">
import { api } from '#convex/api'

const createTask = useConvexMutation(api.tasks.create)
const text = ref('')

async function submit() {
  await createTask({ text: text.value })
  text.value = ''
}
</script>
```

:::
:::tabs-item{label="Authenticate" icon="i-lucide-fingerprint"}

```vue
<script setup lang="ts">
const { isAuthenticated, user, signIn, signOut } = useConvexAuth()

async function signInWithGitHub() {
  await signIn.social({ provider: 'github' })
}
</script>

<template>
  <button v-if="!isAuthenticated" @click="signInWithGitHub">Sign in with GitHub</button>
  <button v-else @click="signOut()">Sign out {{ user?.name }}</button>
</template>
```

:::
:::tabs-item{label="Call from Nitro" icon="i-lucide-server"}

```ts [server/api/tasks.get.ts]
import { api } from '#convex/api'
import { serverConvex } from '#convex/server'

export default defineEventHandler(async (event) => {
  const convex = await serverConvex(event)
  return convex.query(api.tasks.list, {})
})
```

:::
::
::

::landing-stack
::

::u-container
:::div{class="text-center mb-12 xl:mb-16"}
::::h2{class="text-3xl xl:text-4xl font-bold text-highlighted mb-3"}
One model from first render to live updates
::::
::::p{class="text-lg text-muted max-w-2xl mx-auto"}
Render with data on the server, hydrate without a second state system, then keep the same query live in the browser.
::::
:::

:::u-page-grid{class="pb-12 xl:pb-24"}
::landing-feature{title="SSR to realtime" description="One query API handles server rendering, hydration, subscription ownership, and identity changes." icon="i-lucide-refresh-cw" to="/docs/understand/ssr-hydration-realtime"}

::landing-feature{title="Better Auth included" description="A typed, same-origin Better Auth integration keeps session and Convex identity synchronized." icon="i-lucide-fingerprint" to="/docs/build/authentication/overview"}

::landing-feature{title="Explicit security boundaries" description="The library transports identity. Your Convex functions remain the single source of truth for authorization." icon="i-lucide-shield-check" to="/docs/operations/security-model"}

::landing-feature{title="Typed server calls" description="Use a request-scoped Convex caller in Nitro routes, middleware, webhooks, and server utilities." icon="i-lucide-server" to="/docs/build/server/server-convex"}

::landing-feature{title="Optimistic writes" description="Update shared query state immediately and let Convex reconcile or roll back the result." icon="i-lucide-zap" to="/docs/build/write-data/optimistic-updates"}

::landing-feature{title="Files without queue glue" description="Upload with progress, cancellation, bounded concurrency, storage URLs, and explicit cleanup." icon="i-lucide-upload" to="/docs/build/files/upload-files"}
:::
::

::u-container
:::div{class="grid gap-8 lg:grid-cols-2 py-12 xl:py-24"}
::::div

##### Know what the library owns

The docs start with the architecture: request lifecycle, SSR and hydration, query ownership, identity isolation, and client/server boundaries. The API makes more sense once those invariants are clear.

::u-button{to="/docs/understand/mental-model" label="Understand the model" color="neutral" variant="outline" trailing-icon="i-lucide-arrow-right"}
::::
::::div

##### Decide with evidence

See the concrete trade-offs and a version-pinned comparison with the other Nuxt integrations before adopting the module.

::u-button{to="/docs/overview/comparison" label="Compare integrations" color="neutral" variant="outline" trailing-icon="i-lucide-arrow-right"}
::::
:::
::
