---
title: 'The application layer for Nuxt + Convex.'
navigation: false
description: 'Build Nuxt apps on one protected backend model with SSR-aware data, auth, permissions, operations, observability, and agent-safe access.'
---

# One protected backend model for Nuxt + Convex

Trellis keeps Nuxt, Convex, auth, permissions, operations, observability, and MCP on one app-owned backend model instead of splitting those rules across transports.

::callout{icon="i-lucide-arrow-right" color="neutral" to="/docs/getting-started/start-here"}
Start with [Start Here](/docs/getting-started/start-here) if you are evaluating Trellis, then do [First Live Query](/docs/getting-started/first-live-query) before the protected app path.
::

:u-input-copy{value="pnpm add @lupinum/trellis"}

## Common Paths

::card-group

::card{title="Start Here" icon="i-lucide-compass" to="/docs/getting-started/start-here"}
What Trellis adds, which first path to choose, and where to go next.
::

::card{title="Installation" icon="i-lucide-download" to="/docs/getting-started/installation"}
Install the module, wire the basics, and verify the docs examples match your app shape.
::

::card{title="First Live Query" icon="i-lucide-rocket" to="/docs/getting-started/first-live-query"}
Build the smallest useful Trellis app: one query, one mutation, one visible live update.
::

::card{title="Build a Signed-In Todo App" icon="i-lucide-lock" to="/docs/getting-started/build-a-signed-in-todo-app"}
Add auth, one protected query, and one protected mutation without jumping into tenancy or MCP.
::

::card{title="How It Works" icon="i-lucide-waypoints" to="/docs/concepts/how-it-works"}
See the execution model across browser, server, webhook, and agent callers.
::

::card{title="Examples" icon="i-lucide-flask-conical" to="/docs/examples"}
Choose the right repo example before copying patterns into your own app.
::

::card{title="Reference" icon="i-lucide-book-open" to="/docs/reference"}
Look up exact behavior for the high-traffic composables, server helpers, and API surfaces.
::

::

## What It Looks Like

::tabs

:::tabs-item{label="Queries" icon="i-lucide-database"}

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

:::

:::tabs-item{label="Mutations" icon="i-lucide-edit"}

```vue
<script setup lang="ts">
import { api } from '#trellis/api'

const createTask = useConvexMutation(api.tasks.create, {
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
const { can } = usePermissions()
const { data: post } = await useConvexQuery(api.posts.get, { id: props.id })

const canUpdatePost = can('post.update')
const canDeletePost = can('post.delete')
const canPublishPost = can('post.publish')
</script>

<template>
  <article v-if="post">
    <h1>{{ post.title }}</h1>
    <p>{{ post.content }}</p>

    <button v-if="canUpdatePost">Edit</button>
    <button v-if="canDeletePost">Delete</button>
    <button v-if="canPublishPost">Publish</button>
  </article>
</template>
```

:::

::

::landing-stack
::

## Explore The Docs

::card-group

::card{title="Get Started" icon="i-lucide-compass" to="/docs/getting-started"}
The reader path from orientation to the first live query and then the first signed-in app.
::

::card{title="Guides" icon="i-lucide-route" to="/docs/guides"}
Task-first docs for data, auth, permissions, server-side flows, uploads, and MCP tools.
::

::card{title="Concepts" icon="i-lucide-waypoints" to="/docs/concepts"}
One canonical explanation page for the protected backend model.
::

::card{title="Reference" icon="i-lucide-book-type" to="/docs/reference"}
Exact behavior for composables, runtime functions, config, and generated API inventory.
::

::card{title="Examples" icon="i-lucide-flask-conical" to="/docs/examples"}
The canonical public example set, ordered from smallest baseline to the richer workspace model.
::

::card{title="Project" icon="i-lucide-git-branch" to="/docs/project"}
Contributor entry points and the public change record, without turning project docs into a junk drawer.
::

::
