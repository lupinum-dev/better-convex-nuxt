<script setup lang="ts">
import type { Id } from '~~/convex/_generated/dataModel'

import { api } from '#convex/api'

const route = useRoute()
const organizationId = computed(() => route.params.organizationId as Id<'organizations'>)
const { isAuthenticated, isPending } = useConvexAuth()

const organizationArgs = computed(() =>
  isAuthenticated.value ? { organizationId: organizationId.value } : 'skip'
)
const { data: organization, pending: organizationPending } = await useConvexQuery(
  api.organizations.get,
  organizationArgs
)
const { data: projects } = await useConvexQuery(api.projects.list, organizationArgs)
</script>

<template>
  <main class="shell">
    <NuxtLink class="back-link" to="/">Organizations</NuxtLink>
    <section class="header">
      <p>{{ organization?.name ?? 'Organization' }}</p>
      <h1>Projects</h1>
    </section>

    <section v-if="isPending" class="empty">Checking session...</section>

    <AuthPanel
      v-else-if="!isAuthenticated"
      message="Create an account or sign in to manage projects."
    />

    <section v-else-if="organizationPending" class="empty">Loading organization...</section>

    <section v-else-if="!organization" class="empty">Organization not found.</section>

    <template v-else>
      <ProjectCreateForm :organization-id="organizationId" />

      <ul v-if="projects?.length" class="items-list">
        <li v-for="project in projects" :key="project._id">
          {{ project.name }}
        </li>
      </ul>

      <section v-else class="empty">No projects yet.</section>
    </template>
  </main>
</template>
