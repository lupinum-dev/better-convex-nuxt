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
        v-for="ws in workspaces"
        :key="ws.workspaceId"
        :color="ws.workspaceId === currentTenantId ? 'primary' : 'neutral'"
        :variant="ws.workspaceId === currentTenantId ? 'solid' : 'soft'"
        :leading-icon="ws.workspaceId === currentTenantId ? 'i-lucide-check' : undefined"
        @click="$emit('switch', ws.workspaceId)"
      >
        {{ ws.name }}
        <UBadge
          :color="roleBadgeColor(ws.role)"
          variant="subtle"
          size="xs"
          class="ml-1"
        >
          {{ ws.role }}
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
      <p class="text-xs text-muted mt-1">
        Creates two demo client workspaces and assigns you as agency_manager, so the agency
        portfolio card appears below.
      </p>
    </div>
  </UCard>
</template>

<script setup lang="ts">
defineProps<{
  workspaces: Array<{ workspaceId: string; name: string; role: string }> | null
  currentTenantId: string | null
  seedLoading?: boolean
}>()

defineEmits<{
  switch: [workspaceId: string]
  seed: []
}>()

function roleBadgeColor(role: string) {
  switch (role) {
    case 'owner': return 'success'
    case 'member': return 'info'
    case 'agency_admin':
    case 'agency_manager': return 'warning'
    default: return 'neutral'
  }
}
</script>
