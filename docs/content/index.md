---
title: "Real-time Nuxt apps with Convex."
navigation: false
description: "Full-featured Convex integration for Nuxt. Real-time queries with SSR, mutations with optimistic updates, authentication, and fine-grained permissions."
---

::u-page-hero
---
orientation: 'horizontal'
description: Full-featured Convex integration for Nuxt with SSR, real-time subscriptions, authentication, and backend-driven permissions.
ui:
  container: 'lg:items-start flex flex-col lg:grid pt-24 sm:pt-32 lg:pt-40 pb-0 sm:pb-0 lg:pb-0 gap-16 sm:gap-y-0'
---
#title
Full-stack Nuxt that [feels like cheating]{.text-primary}
#links
  :::u-button
  ---
  size: lg
  to: /docs/getting-started/installation
  color: warning
  trailing-icon: i-lucide-arrow-right
  ---
  Get Started
  :::

  :u-input-copy{value="pnpm add better-convex-nuxt"}

#default
::tabs{class="xl:-mt-10 bg-white dark:bg-neutral-900"}
:::tabs-item{label="Queries" icon="i-lucide-database"}

```vue
<script setup lang="ts">
import { api } from "~/convex/_generated/api";

// Real-time subscription with SSR support
const { data: tasks, status } = useConvexQuery(api.tasks.list, {
  status: "active",
});

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
import { api } from "~/convex/_generated/api";

const { mutate, pending } = useConvexMutation(api.tasks.create, {
  // Instant UI feedback with optimistic updates
  optimisticUpdate: (localStore, args) => {
    updateQuery({
      query: api.tasks.list,
      args: {},
      localQueryStore: localStore,
      updater: (current) =>
        current
          ? [{ _id: "temp", text: args.text, completed: false }, ...current]
          : [],
    });
  },
});

await mutate({ text: "Ship my app" });
</script>
```

:::
:::tabs-item{label="Auth" icon="i-lucide-lock"}

```vue
<script setup lang="ts">
const { isAuthenticated, user } = useConvexAuth();
const authClient = useAuthClient();

async function handleLogin(email: string, password: string) {
  const { error } = await authClient.signIn.email({ email, password });
  if (!error) navigateTo("/dashboard");
}

async function handleOAuth() {
  await authClient.signIn.social({ provider: "github" });
}
</script>

<template>
  <div v-if="isAuthenticated">
    Welcome, {{ user?.name }}!
    <button @click="authClient.signOut()">Sign Out</button>
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
const { can, role } = usePermissions();
const { data: post } = useConvexQuery(api.posts.get, { id: props.id });
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

::u-container
:::div{class="text-center mb-12 xl:mb-16"}
::::u-text{class="text-3xl xl:text-4xl font-bold text-highlighted mb-3"}
Everything You Need
::::
::::u-text{class="text-lg text-muted max-w-xl mx-auto"}
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
  description: Instant UI feedback with automatic rollback on failure. Make your app feel fast.
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
  to: /docs/auth-security/permissions
  ---
  :::
  :::landing-feature
  ---
  title: SSR Support
  description: Server-side rendering with hydration. Fast initial loads, then real-time updates.
  icon: i-lucide-server
  to: /docs/server-side/ssr-hydration
  ---
  :::
  :::landing-feature
  ---
  title: Type Safety
  description: Full TypeScript inference from your Convex schema. Catch errors at compile time.
  icon: i-lucide-type
  to: /docs/data-fetching/queries#typescript
  ---
  :::
:::
::


