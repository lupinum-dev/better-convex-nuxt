<script setup lang="ts">
import type { InviteRole, OrganizationRole } from '~~/shared/organizationRoles'
import { inviteRoles, organizationRoles } from '~~/shared/organizationRoles'

import type { Member } from '~/utils/managementResponses'

const inviteEmail = defineModel<string>('inviteEmail', { required: true })
const inviteRole = defineModel<InviteRole>('inviteRole', { required: true })

defineProps<{
  canManageMembers?: boolean
  members: Member[]
  selectedTeamMemberUserIds: Set<string>
  selectedTeamId: string | null
  invitePending: boolean
  inviteError: string | null
  membersPending: boolean
  membersError: string | null
  teamMembersError: string | null
  memberLabel: (member: Member) => string
  onInvite: () => void
  onChangeRole: (member: Member, role: OrganizationRole) => void
  onAddToTeam: (member: Member) => void
  onRemoveFromTeam: (member: Member) => void
  onRemoveMember: (member: Member) => void
}>()

function formatRole(role: OrganizationRole | InviteRole) {
  return role.charAt(0).toUpperCase() + role.slice(1)
}
</script>

<template>
  <section v-if="canManageMembers" class="activity">
    <h2>Members</h2>
    <form class="toolbar" @submit.prevent="onInvite">
      <input v-model="inviteEmail" placeholder="Email" :disabled="invitePending" />
      <select v-model="inviteRole" :disabled="invitePending">
        <option v-for="role in inviteRoles" :key="role" :value="role">
          {{ formatRole(role) }}
        </option>
      </select>
      <button
        class="button"
        type="submit"
        :disabled="invitePending || !inviteEmail.trim() || !selectedTeamId"
      >
        Invite
      </button>
    </form>
    <section v-if="inviteError" class="empty">{{ inviteError }}</section>
    <section v-if="membersPending" class="empty">Loading members...</section>
    <section v-else-if="membersError" class="empty">{{ membersError }}</section>
    <section v-else-if="teamMembersError" class="empty">{{ teamMembersError }}</section>
    <ul v-else-if="members.length" class="items-list">
      <li v-for="member in members" :key="member.id">
        <span>{{ memberLabel(member) }}</span>
        <select
          :value="member.role"
          @change="
            onChangeRole(member, ($event.target as HTMLSelectElement).value as OrganizationRole)
          "
        >
          <option v-for="role in organizationRoles" :key="role" :value="role">
            {{ formatRole(role) }}
          </option>
        </select>
        <button
          v-if="!selectedTeamMemberUserIds.has(member.userId)"
          class="button"
          @click="onAddToTeam(member)"
        >
          Add to team
        </button>
        <button v-else class="button" @click="onRemoveFromTeam(member)">Remove from team</button>
        <button class="button" @click="onRemoveMember(member)">Remove</button>
      </li>
    </ul>
    <section v-else class="empty">No members yet.</section>
  </section>
</template>
