<template>
  <div
    class="min-h-screen p-6 bg-linear-to-br from-purple-50 to-white dark:from-purple-950/20 dark:to-neutral-950"
  >
    <div class="max-w-3xl mx-auto space-y-4">
      <UCard>
        <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <UButton to="/" variant="link" leading-icon="i-lucide-arrow-left" class="mb-2">
              Back to hub
            </UButton>
            <h1 class="text-2xl font-bold">Projects</h1>
            <p class="text-sm text-muted mt-1">
              <template v-if="currentWorkspaceName">
                Workspace:
                <span class="font-semibold text-highlighted">{{ currentWorkspaceName }}</span>
                &middot;
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
import { agencyPermissionKeys } from '~/shared/permissions'

definePageMeta({ convexAuth: true })

const { allows, role, tenantId } = usePermissions()
const canCreateProject = allows(agencyPermissionKeys.projectCreate)

const workspaceArgs = computed(() => (tenantId.value ? {} : undefined))
const { data: projects } = await useConvexQuery(api.projects.list, workspaceArgs)
const { data: accessibleWorkspaces } = await useConvexQuery(
  api.workspaces.listAccessibleWorkspaces,
  workspaceArgs,
)

const currentWorkspaceName = computed(() => {
  if (!tenantId.value || !accessibleWorkspaces.value) return null
  return accessibleWorkspaces.value.find((w) => w.workspaceId === tenantId.value)?.name ?? null
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
