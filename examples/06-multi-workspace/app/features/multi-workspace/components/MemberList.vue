<template>
  <UCard>
    <template #header>
      <h3 class="text-lg font-semibold">Workspace members</h3>
      <p class="text-sm text-muted mt-1">
        Members and their roles in the current workspace. Role is stored per membership, not per
        user.
      </p>
    </template>

    <div v-if="!members?.length" class="flex flex-col items-center gap-2 py-8 text-muted">
      <UIcon name="i-lucide-users" class="h-8 w-8" />
      <p class="text-sm">No members found.</p>
    </div>

    <ul class="space-y-2">
      <li
        v-for="member in members"
        :key="member._id"
        class="flex items-center justify-between gap-3 rounded-xl border border-default bg-elevated px-4 py-3"
      >
        <div>
          <p class="font-medium text-highlighted">
            {{ member.displayName || member.email || `User ${member.userId.slice(0, 8)}...` }}
          </p>
          <p v-if="member.email && member.displayName" class="text-xs text-muted">
            {{ member.email }}
          </p>
        </div>
        <UBadge :color="roleBadgeColor(member.role)" variant="subtle" size="xs">
          {{ member.role }}
        </UBadge>
      </li>
    </ul>
  </UCard>
</template>

<script setup lang="ts">
defineProps<{
  members: Array<{
    _id: string
    userId: string
    role: string
    displayName: string | null
    email: string | null
  }> | null
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
