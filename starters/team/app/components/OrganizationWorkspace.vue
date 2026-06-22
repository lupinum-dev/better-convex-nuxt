<script setup lang="ts">
import { api } from '#convex/api'

const currentUser = useConvexUser(api.users.getCurrent, {}, { source: 'projection' })
const { signOut } = useConvexAuth()
const { data: organizations } = await useConvexQuery(api.organizations.listMine, {})

const hasUserProjection = computed(() => currentUser.source.value === 'projection')
</script>

<template>
  <section v-if="currentUser.data.value" class="user">
    <span>
      {{ currentUser.data.value.email || currentUser.data.value.name || 'Signed in' }}
    </span>
    <button type="button" @click="signOut()">Sign out</button>
  </section>

  <template v-if="hasUserProjection">
    <OrganizationCreateForm />

    <nav v-if="organizations?.length" class="list">
      <NuxtLink v-for="org in organizations ?? []" :key="org._id" :to="`/organizations/${org._id}`">
        <strong>{{ org.name }}</strong>
        <span>{{ org.role }}</span>
      </NuxtLink>
    </nav>

    <section v-else class="empty">No organizations yet.</section>
  </template>

  <section v-else class="empty">Finishing account setup...</section>
</template>
