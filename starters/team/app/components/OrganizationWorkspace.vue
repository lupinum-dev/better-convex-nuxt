<script setup lang="ts">
import { api } from '~~/convex/_generated/api'

const { user, signOut } = useConvexAuth()
const { data: organizations } = await useConvexQuery(api.organizations.listMine, {})
</script>

<template>
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
