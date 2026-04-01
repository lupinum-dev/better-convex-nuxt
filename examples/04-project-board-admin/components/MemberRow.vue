<script setup lang="ts">
/**
 * Why this file exists:
 * Changing roles live is the clearest proof that frontend permission state is reactive end to end.
 */
import type { Doc } from '~/convex/_generated/dataModel'
import { api } from '~/convex/_generated/api'

const props = defineProps<{
  member: Doc<'users'>
}>()

const { can } = usePermissions()
const canManageMembers = can('workspace.members')
const changeRole = useConvexMutation(api.members.changeRole)
const memberKey = computed(() => props.member.email || props.member.authId)

async function handleRoleChange(event: Event) {
  const select = event.target as HTMLSelectElement
  await changeRole({
    userId: props.member._id,
    newRole: select.value as 'admin' | 'member' | 'viewer',
  })
}
</script>

<template>
  <div class="flex items-center justify-between gap-4 py-3 border-b border-default">
    <div class="min-w-0">
      <p class="font-medium text-highlighted truncate">{{ props.member.displayName || props.member.authId }}</p>
      <p class="text-sm text-muted truncate">{{ props.member.email || props.member.authId }}</p>
    </div>

    <select
      v-if="canManageMembers && props.member.role !== 'owner'"
      :data-testid="`member-role-${memberKey}`"
      :value="props.member.role"
      class="min-w-28 rounded-md border border-default bg-default px-3 py-1.5 text-sm"
      @change="handleRoleChange"
    >
      <option value="admin">admin</option>
      <option value="member">member</option>
      <option value="viewer">viewer</option>
    </select>

    <UBadge v-else variant="subtle" color="neutral">{{ props.member.role }}</UBadge>
  </div>
</template>
