<template>
  <div
    class="min-h-screen bg-linear-to-br from-purple-50 to-white p-6 dark:from-purple-950/20 dark:to-neutral-950"
  >
    <div class="mx-auto max-w-3xl space-y-4">
      <UCard>
        <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <UButton to="/" variant="link" leading-icon="i-lucide-arrow-left" class="mb-2">
              Back to hub
            </UButton>
            <h1 class="text-2xl font-bold">Projects</h1>
            <p class="mt-1 text-sm text-muted">
              <template v-if="currentWorkspaceName">
                Workspace:
                <span class="font-semibold text-highlighted">{{ currentWorkspaceName }}</span>
                ·
              </template>
              Role:
              <UBadge :color="roleBadgeColor" variant="subtle" size="xs">{{ role }}</UBadge>
            </p>
          </div>
        </div>
      </UCard>

      <ProjectList :projects="projects" :can-create="canCreateProject" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import { api } from '#trellis/api'
import { projectCreate } from '#trellis/permissions'

import ProjectList from './ProjectList.vue'

const { can, role, workspaceId } = useAccess()
const canCreateProject = can(projectCreate)

const workspaceArgs = computed(() => (workspaceId.value ? {} : undefined))
const { data: projects } = await useConvexQuery(api.features.projects.domain.list, workspaceArgs)
const { data: accessibleWorkspaces } = await useConvexQuery(
  api.features.workspaces.domain.listAccessibleWorkspaces,
  workspaceArgs,
)

const currentWorkspaceName = computed(() => {
  if (!workspaceId.value || !accessibleWorkspaces.value) return null
  return (
    accessibleWorkspaces.value.find(
      (workspace: { workspaceId: string; name: string }) =>
        workspace.workspaceId === workspaceId.value,
    )?.name ?? null
  )
})

const roleBadgeColor = computed(() => {
  switch (role.value) {
    case 'owner':
      return 'success'
    case 'member':
      return 'info'
    case 'agency_admin':
    case 'agency_manager':
      return 'warning'
    default:
      return 'neutral'
  }
})
</script>
