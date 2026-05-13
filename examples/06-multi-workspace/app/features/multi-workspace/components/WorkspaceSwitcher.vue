<template>
  <UCard v-if="workspaces?.length">
    <template #header>
      <h3 class="text-lg font-semibold">Accessible workspaces</h3>
      <p class="text-sm text-muted mt-1">
        Switch between assigned client workspaces. Role is resolved per workspace from memberships.
      </p>
    </template>

    <div class="flex flex-wrap gap-2">
      <UButton
        v-for="workspace in workspaces"
        :key="workspace.workspaceId"
        :color="workspace.workspaceId === currentWorkspaceId ? 'primary' : 'neutral'"
        :variant="workspace.workspaceId === currentWorkspaceId ? 'solid' : 'soft'"
        :leading-icon="workspace.workspaceId === currentWorkspaceId ? 'i-lucide-check' : undefined"
        @click="$emit('switch', workspace.workspaceId)"
      >
        {{ workspace.name }}
        <UBadge :color="roleBadgeColor(workspace.role)" variant="subtle" size="xs" class="ml-1">
          {{ workspace.role }}
        </UBadge>
      </UButton>
    </div>

    <div class="mt-3">
      <UButton
        color="neutral"
        variant="ghost"
        leading-icon="i-lucide-database"
        size="sm"
        :loading="seedLoading"
        @click="$emit('seed')"
      >
        Seed agency portfolio
      </UButton>
      <p class="mt-1 text-xs text-muted">
        Creates two demo client workspaces and assigns you as agency_manager, so the agency
        portfolio card appears below.
      </p>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import type { Id } from '~~/convex/_generated/dataModel'

defineProps<{
  workspaces: Array<{ workspaceId: Id<'workspaces'>; name: string; role: string }> | null
  currentWorkspaceId: string | null
  seedLoading?: boolean
}>()

defineEmits<{
  switch: [workspaceId: Id<'workspaces'>]
  seed: []
}>()

function roleBadgeColor(role: string) {
  switch (role) {
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
}
</script>
