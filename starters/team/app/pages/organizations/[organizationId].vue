<script setup lang="ts">
import { api } from '~~/convex/_generated/api'
import type { Id } from '~~/convex/_generated/dataModel'

const route = useRoute()
const organizationId = computed(() => route.params.organizationId as Id<'organizations'>)
const { isAuthenticated, isPending } = useConvexAuth()

const projectArgs = computed(() =>
  isAuthenticated.value ? { organizationId: organizationId.value } : undefined
)
const { data: projects } = await useConvexQuery(api.projects.list, projectArgs)
</script>

<template>
  <main class="shell">
    <NuxtLink to="/">Organizations</NuxtLink>
    <h1>Projects</h1>

    <AuthPanel
      v-if="!isAuthenticated"
      :checking="isPending"
      message="Create an account or sign in to manage projects."
    />

    <ProjectCreateForm v-else :organization-id="organizationId" />

    <ul v-if="isAuthenticated" class="items-list">
      <li v-for="project in projects ?? []" :key="project._id">
        {{ project.name }}
      </li>
    </ul>
  </main>
</template>
