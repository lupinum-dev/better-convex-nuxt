<script setup lang="ts">
import { api } from '#trellis/api'
/**
 * Why this file exists:
 * Changing roles live is the clearest proof that frontend permission state is reactive end to end.
 */
import type { Doc } from '~/convex/_generated/dataModel'
import { saasPermissionKeys } from '~/shared/permissions'

const props = defineProps<{
  member: Doc<'users'>
}>()

const toast = useToast()
const { allows } = usePermissions()
const canManageMembers = allows(saasPermissionKeys.workspaceMembers)
const changeRole = useConvexMutation(api.members.changeRole, {
  onSuccess: () =>
    toast.add({ title: 'Role updated', color: 'success', icon: 'i-lucide-shield-check' }),
  onError: (error) =>
    toast.add({ title: 'Could not change role', description: error.message, color: 'error' }),
})
const memberKey = computed(() => props.member.email || props.member.authId)
const roleItems = ['admin', 'member', 'viewer']

async function handleRoleSelect(value: string) {
  await changeRole({
    userId: props.member._id,
    newRole: value as 'admin' | 'member' | 'viewer',
  })
}
</script>

<template>
  <div class="flex items-center justify-between gap-4 py-3 border-b border-default">
    <div class="min-w-0">
      <p class="font-medium text-highlighted truncate">
        {{ props.member.displayName || props.member.authId }}
      </p>
      <p class="text-sm text-muted truncate">{{ props.member.email || props.member.authId }}</p>
    </div>

    <USelect
      v-if="canManageMembers && props.member.role !== 'owner'"
      :data-testid="`member-role-${memberKey}`"
      :model-value="props.member.role"
      :items="roleItems"
      size="sm"
      class="min-w-28"
      @update:model-value="handleRoleSelect"
    />

    <UBadge v-else variant="subtle" color="neutral">{{ props.member.role }}</UBadge>
  </div>
</template>
