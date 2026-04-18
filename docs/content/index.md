---
title: 'The application layer for Nuxt + Convex.'
navigation: false
description: 'Build Nuxt apps on one protected backend model with SSR-aware data, auth, permissions, operations, and agent-safe access.'
---

## ::u-page-hero

orientation: 'horizontal'
description: Trellis keeps Nuxt, Convex, auth, permissions, operations, and MCP on one app-owned backend model instead of splitting those rules across transports.
ui:
container: 'lg:items-start flex flex-col lg:grid pt-24 sm:pt-32 lg:pt-40 pb-0 sm:pb-0 lg:pb-0 gap-16 sm:gap-y-0'

---

#title
One protected backend model for [Nuxt + Convex]{.text-primary}
#links
:::u-button

---

size: lg
to: /docs/getting-started/start-here
color: warning
trailing-icon: i-lucide-arrow-right

---

Get Started
:::

:u-input-copy{value="pnpm add @lupinum/trellis"}

#default
::tabs{class="xl:-mt-10 bg-white dark:bg-neutral-900"}
:::tabs-item{label="Queries" icon="i-lucide-database"}

```vue
<script setup lang="ts">
import { api } from '#trellis/api'

// Real-time subscription with SSR support
const { data: tasks, status } = await useConvexQuery(api.tasks.list, {
  status: 'active',
})

// Data updates automatically when any client makes changes
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

:::
:::tabs-item{label="Mutations" icon="i-lucide-edit"}

```vue
<script setup lang="ts">
import { api } from '#trellis/api'

const createTask = useConvexMutation(api.tasks.create, {
  // Instant UI feedback with optimistic updates
  optimisticUpdate: (ctx, args) => {
    ctx
      .query(api.tasks.list, {})
      .update((current) =>
        current ? [{ _id: 'temp', text: args.text, completed: false }, ...current] : [],
      )
  },
})

await createTask({ text: 'Ship my app' })
</script>
```

:::
:::tabs-item{label="Auth" icon="i-lucide-lock"}

```vue
<script setup lang="ts">
const { isAuthenticated, user, signOut, client } = useConvexAuth()
const { execute } = useConvexAuthActions()

async function handleLogin(email: string, password: string) {
  if (!client) return
  await execute(() => client.signIn.email({ email, password }), { redirectTo: '/dashboard' })
}

async function handleOAuth() {
  if (!client) return
  await client.signIn.social({ provider: 'github' })
}
</script>

<template>
  <div v-if="isAuthenticated">
    Welcome, {{ user?.name }}!
    <button @click="signOut()">Sign Out</button>
  </div>
  <div v-else>
    <button @click="handleOAuth">Sign in with GitHub</button>
  </div>
</template>
```

:::
:::tabs-item{label="Permissions" icon="i-lucide-shield"}

```vue
<script setup lang="ts">
import { api } from '#trellis/api'

const props = defineProps<{ id: string }>()
const { can, role } = usePermissions()
const { data: post } = await useConvexQuery(api.posts.get, { id: props.id })
</script>

<template>
  <article v-if="post">
    <h1>{{ post.title }}</h1>
    <p>{{ post.content }}</p>

    <!-- Show actions based on role and ownership -->
    <button v-if="can('post.update', post)">Edit</button>
    <button v-if="can('post.delete', post)">Delete</button>
    <button v-if="can('post.publish')">Publish</button>
  </article>
</template>
```

:::
::
::

::landing-stack
::

::u-container
:::div{class="text-center mb-12 xl:mb-16"}
::::h2{class="text-3xl xl:text-4xl font-bold text-highlighted mb-3"}
Everything You Need
::::
::::p{class="text-lg text-muted max-w-xl mx-auto"}
Built-in features for building production-ready apps
::::
:::

:::u-page-grid{class="pb-12 xl:pb-24"}
:::landing-feature

---

title: Real-time Queries
description: Fetch data with SSR, then upgrade to WebSocket subscriptions. Changes sync instantly across all clients.
icon: i-lucide-database
to: /docs/data-fetching/queries

---

:::
:::landing-feature

---

title: Optimistic Updates
description: Instant UI feedback with optimistic updates and live query reconciliation.
icon: i-lucide-zap
to: /docs/mutations/optimistic-updates

---

:::
:::landing-feature

---

title: Authentication
description: Better Auth integration with email/password, OAuth, and magic links. SSR-compatible.
icon: i-lucide-lock
to: /docs/auth-security/authentication

---

:::
:::landing-feature

---

title: Permissions
description: Role-based access control with ownership rules. Backend enforces, frontend displays.
icon: i-lucide-shield
to: /docs/permissions/setup

---

:::
:::landing-feature

---

title: SSR Support
description: Server-side rendering with hydration. Fast initial loads, then real-time updates.
icon: i-lucide-server
to: /docs/server-side/ssr-overview

---

:::
:::landing-feature

---

title: Type Safety
description: Nuxt auto-imports, generated aliases, and Convex function refs stay strongly typed across the app.
icon: i-lucide-type
to: /docs/api-reference/api-surface

---

:::
:::landing-feature

---

title: File Storage
description: Upload files with progress tracking, cancel support, and multi-file queues with concurrency control.
icon: i-lucide-upload
to: /docs/file-uploads/single-file-upload

---

:::
:::
::
