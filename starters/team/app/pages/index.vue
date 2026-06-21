<script setup lang="ts">
import { api } from '~~/convex/_generated/api'

const { isAuthenticated, isPending, user, signOut } = useConvexAuth()
const organizationArgs = computed(() => (isAuthenticated.value ? {} : undefined))
const { data: organizations } = await useConvexQuery(api.organizations.listMine, organizationArgs)
</script>

<template>
  <main class="shell">
    <section class="header">
      <p>Team starter</p>
      <h1>Organizations</h1>
    </section>

    <AuthPanel
      v-if="!isAuthenticated"
      :checking="isPending"
      message="Create an account or sign in to manage organizations."
    />

    <template v-else>
      <section v-if="user" class="user">
        <span>{{ user.email || user.name || 'Signed in' }}</span>
        <button type="button" @click="signOut()">Sign out</button>
      </section>

      <OrganizationCreateForm />

      <nav class="list">
        <NuxtLink
          v-for="org in organizations ?? []"
          :key="org._id"
          :to="`/organizations/${org._id}`"
        >
          <strong>{{ org.name }}</strong>
          <span>{{ org.role }}</span>
        </NuxtLink>
      </nav>
    </template>
  </main>
</template>
