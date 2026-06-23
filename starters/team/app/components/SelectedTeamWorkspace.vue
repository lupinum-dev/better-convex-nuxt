<script setup lang="ts">
import type { OrganizationRole } from '~~/shared/organizationRoles'

import { api } from '#convex/api'
import type { Member } from '~/utils/organizationModels'

const props = defineProps<{
  organizationId: string
  teamId: string
  members: Member[]
  membersPending: boolean
  membersError: string | null
  canManageMembers?: boolean
  memberLabel: (member: Member) => string
  onChangeRole: (member: Member, role: OrganizationRole) => void
  onAddToTeam: (member: Member) => void
  onRemoveFromTeam: (member: Member) => void
  onRemoveMember: (member: Member) => void
}>()

const { data: teamCapabilities } = await useConvexQuery(api.teams.getCapabilities, () => ({
  teamId: props.teamId,
}))
const { data: teamMemberIds, error: teamMembersQueryError } = await useConvexQuery(
  api.teams.listMemberIds,
  () => (props.canManageMembers ? { teamId: props.teamId } : 'skip'),
)

const selectedTeamMemberUserIds = computed(() => new Set(teamMemberIds.value ?? []))
const teamMembersError = computed(() =>
  teamMembersQueryError.value instanceof Error ? teamMembersQueryError.value.message : null,
)
</script>

<template>
  <MembersPanel
    :can-manage-members="canManageMembers"
    :members="members"
    :selected-team-member-user-ids="selectedTeamMemberUserIds"
    :members-pending="membersPending"
    :members-error="membersError"
    :team-members-error="teamMembersError"
    :member-label="memberLabel"
    :on-change-role="onChangeRole"
    :on-add-to-team="onAddToTeam"
    :on-remove-from-team="onRemoveFromTeam"
    :on-remove-member="onRemoveMember"
  />

  <TeamProjectsSection
    v-if="teamCapabilities?.canViewProjects"
    :team-id="teamId"
    :can-create-project="teamCapabilities?.canCreateProject"
    :can-update-project="teamCapabilities?.canUpdateProject"
    :can-delete-project="teamCapabilities?.canDeleteProject"
  />

  <TeamAuditSection v-if="teamCapabilities?.canViewProjects" :team-id="teamId" />
</template>
