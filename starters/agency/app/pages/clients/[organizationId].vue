<script setup lang="ts">
import { api } from '~~/convex/_generated/api'
import type { Id } from '~~/convex/_generated/dataModel'

const route = useRoute()
const clientOrganizationId = computed(() => route.params.organizationId as Id<'organizations'>)
const agencyOrganizationId = computed(
  () => route.query.agencyOrganizationId as Id<'organizations'> | undefined
)
const projectName = ref('')

const { data: projects } = await useConvexQuery(api.clientProjects.listForClient, {
  clientOrganizationId: clientOrganizationId.value,
  agencyOrganizationId: agencyOrganizationId.value
})
const { execute: createProject } = useConvexMutation(api.clientProjects.createForClient)

async function addProject() {
  const name = projectName.value.trim()
  if (!name || !agencyOrganizationId.value) return
  await createProject({
    agencyOrganizationId: agencyOrganizationId.value,
    clientOrganizationId: clientOrganizationId.value,
    name
  })
  projectName.value = ''
}
</script>

<template>
  <main class="shell">
    <NuxtLink to="/agency">Clients</NuxtLink>
    <h1>Client projects</h1>

    <form class="row" @submit.prevent="addProject">
      <input v-model="projectName" placeholder="Project name" />
      <button :disabled="!projectName.trim() || !agencyOrganizationId">Create</button>
    </form>

    <ul>
      <li v-for="project in projects ?? []" :key="project._id">
        {{ project.name }}
      </li>
    </ul>
  </main>
</template>

