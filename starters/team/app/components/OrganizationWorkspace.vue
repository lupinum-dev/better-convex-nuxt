<script setup lang="ts">
import { api } from '#convex/api'

const currentUser = useConvexUser(api.users.getCurrent, {}, { source: 'projection' })
const { signOut, refreshAuth } = useConvexAuth()
const { data: organizations, pending: organizationsPending } = await useConvexQuery(
  api.organizations.listMine,
  {},
)

const hasUserProjection = computed(() => currentUser.source.value === 'projection')

async function signOutAndRefresh() {
  await signOut()
  await refreshAuth()
}
</script>

<template>
  <section v-if="currentUser.data.value" class="user">
    <span>
      {{ currentUser.data.value.email || currentUser.data.value.name || 'Signed in' }}
    </span>
    <button type="button" @click="signOutAndRefresh">Sign out</button>
  </section>

  <template v-if="hasUserProjection">
    <OrganizationCreateForm />

    <section v-if="organizationsPending" class="empty">Loading organizations...</section>

    <nav v-else-if="organizations?.length" class="list">
      <NuxtLink v-for="org in organizations" :key="org.id" :to="`/organizations/${org.id}`">
        <strong>{{ org.name }}</strong>
        <span>{{ org.role ?? 'member' }}</span>
      </NuxtLink>
    </nav>

    <section v-else class="empty">No organizations yet.</section>
  </template>

  <section v-else class="empty">Finishing account setup...</section>
</template>
