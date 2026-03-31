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
  <div class="member-row">
    <div>
      <strong>{{ props.member.displayName || props.member.authId }}</strong>
      <p class="hint">{{ props.member.email || props.member.authId }}</p>
    </div>

    <select
      v-if="canManageMembers && props.member.role !== 'owner'"
      :data-testid="`member-role-${memberKey}`"
      :value="props.member.role"
      class="select"
      @change="handleRoleChange"
    >
      <option value="admin">admin</option>
      <option value="member">member</option>
      <option value="viewer">viewer</option>
    </select>

    <span v-else class="badge">{{ props.member.role }}</span>
  </div>
</template>

<style scoped>
.member-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.85rem 0;
  border-bottom: 1px solid #e6edf5;
}

.hint {
  margin: 0.15rem 0 0;
  color: #667085;
  font-size: 0.85rem;
}

.select,
.badge {
  min-width: 7rem;
}
</style>
