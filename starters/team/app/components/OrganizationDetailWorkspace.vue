<script setup lang="ts">
import type { InviteRole, OrganizationRole } from '~~/shared/organizationRoles'

import { api } from '#convex/api'
import type { Member, OrganizationSummary, Team } from '~/utils/organizationModels'

const props = defineProps<{
  organization: OrganizationSummary
}>()

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

const organizationId = computed(() => props.organization.id)
const createTeamMutation = useConvexMutation(api.organizations.createTeam)
const renameOrganizationMutation = useConvexMutation(api.organizations.rename)
const renameTeamMutation = useConvexMutation(api.teams.rename)
const inviteMemberMutation = useConvexMutation(api.organizations.inviteMember)
const changeRoleMutation = useConvexMutation(api.organizations.changeMemberRole)
const removeMemberMutation = useConvexMutation(api.organizations.removeMember)
const addTeamMemberMutation = useConvexMutation(api.teams.addMember)
const removeTeamMemberMutation = useConvexMutation(api.teams.removeMember)

const { data: orgCapabilities } = await useConvexQuery(api.organizations.getCapabilities, () => ({
  organizationId: organizationId.value,
}))
const {
  data: teamsData,
  pending: teamsPending,
  error: teamsQueryError,
} = await useConvexQuery(api.organizations.listTeams, () => ({
  organizationId: organizationId.value,
}))
const {
  data: membersData,
  pending: membersPending,
  error: membersQueryError,
} = await useConvexQuery(api.organizations.listMembers, () => ({
  organizationId: organizationId.value,
}))

const selectedTeamId = ref<string | null>(null)
const teamName = ref('')
const teamRenameName = ref('')
const teamCreatePending = ref(false)
const teamCreateError = ref<string | null>(null)
const orgName = ref(props.organization.name)
const orgRenamePending = ref(false)
const orgRenameError = ref<string | null>(null)
const teamRenamePending = ref(false)
const teamRenameError = ref<string | null>(null)
const inviteEmail = ref('')
const inviteRole = ref<InviteRole>('member')
const invitePending = ref(false)
const inviteError = ref<string | null>(null)

const teams = computed(() => teamsData.value ?? [])
const members = computed(() => membersData.value ?? [])
const teamsError = computed(() =>
  teamsQueryError.value ? errorMessage(teamsQueryError.value, 'Teams could not be loaded') : null,
)
const membersError = computed(() =>
  membersQueryError.value
    ? errorMessage(membersQueryError.value, 'Members could not be loaded')
    : null,
)
const selectedTeam = computed<Team | null>(
  () => teams.value.find((team) => team.id === selectedTeamId.value) ?? null,
)

watch(
  teams,
  (nextTeams) => {
    if (!selectedTeamId.value || !nextTeams.some((team) => team.id === selectedTeamId.value)) {
      selectedTeamId.value = nextTeams[0]?.id ?? null
    }
  },
  { immediate: true },
)

watch(
  selectedTeam,
  (team) => {
    teamRenameName.value = team?.name ?? ''
  },
  { immediate: true },
)

watch(
  () => props.organization.name,
  (nextName) => {
    orgName.value = nextName
  },
)

async function createTeam() {
  const name = teamName.value.trim()
  if (!name) return

  teamCreatePending.value = true
  teamCreateError.value = null
  try {
    const team = await createTeamMutation({
      organizationId: organizationId.value,
      name,
    })
    teamName.value = ''
    selectedTeamId.value = team.id
  } catch (error) {
    teamCreateError.value = errorMessage(error, 'Team was not created')
  } finally {
    teamCreatePending.value = false
  }
}

async function renameOrganization() {
  const name = orgName.value.trim()
  if (!name || name === props.organization.name) return

  orgRenamePending.value = true
  orgRenameError.value = null
  try {
    await renameOrganizationMutation({
      organizationId: organizationId.value,
      name,
    })
  } catch (error) {
    orgRenameError.value = errorMessage(error, 'Organization was not renamed')
  } finally {
    orgRenamePending.value = false
  }
}

async function renameSelectedTeam() {
  if (!selectedTeam.value) return

  const nextName = teamRenameName.value.trim()
  if (!nextName || nextName === selectedTeam.value.name) return

  teamRenamePending.value = true
  teamRenameError.value = null
  try {
    await renameTeamMutation({
      teamId: selectedTeam.value.id,
      name: nextName,
    })
  } catch (error) {
    teamRenameError.value = errorMessage(error, 'Team was not renamed')
  } finally {
    teamRenamePending.value = false
  }
}

async function inviteMember() {
  if (!selectedTeamId.value) return
  const email = inviteEmail.value.trim()
  if (!email) return

  invitePending.value = true
  inviteError.value = null
  try {
    await inviteMemberMutation({
      organizationId: organizationId.value,
      email,
      role: inviteRole.value,
      teamId: selectedTeamId.value,
    })
    inviteEmail.value = ''
  } catch (error) {
    inviteError.value = errorMessage(error, 'Member was not invited')
  } finally {
    invitePending.value = false
  }
}

async function changeMemberRole(member: Member, role: OrganizationRole) {
  if (role === member.role) return

  await changeRoleMutation({
    organizationId: organizationId.value,
    memberId: member.id,
    role,
  })
}

async function removeMember(member: Member) {
  await removeMemberMutation({
    organizationId: organizationId.value,
    memberId: member.id,
  })
}

async function addMemberToSelectedTeam(member: Member) {
  if (!selectedTeamId.value) return

  await addTeamMemberMutation({
    teamId: selectedTeamId.value,
    userId: member.userId,
  })
}

async function removeMemberFromSelectedTeam(member: Member) {
  if (!selectedTeamId.value) return

  await removeTeamMemberMutation({
    teamId: selectedTeamId.value,
    userId: member.userId,
  })
}

function memberLabel(member: Member) {
  return member.user?.name || member.user?.email || member.userId
}
</script>

<template>
  <OrganizationAdminPanel
    v-model:selected-team-id="selectedTeamId"
    v-model:org-name="orgName"
    v-model:team-name="teamName"
    v-model:team-rename-name="teamRenameName"
    :organization="organization"
    :role="orgCapabilities?.role"
    :can-manage-organization="orgCapabilities?.canManageOrganization"
    :can-manage-teams="orgCapabilities?.canManageTeams"
    :teams="teams"
    :selected-team="selectedTeam"
    :teams-pending="teamsPending"
    :teams-error="teamsError"
    :org-rename-pending="orgRenamePending"
    :org-rename-error="orgRenameError"
    :team-rename-pending="teamRenamePending"
    :team-rename-error="teamRenameError"
    :team-create-pending="teamCreatePending"
    :team-create-error="teamCreateError"
    :on-rename-organization="renameOrganization"
    :on-rename-team="renameSelectedTeam"
    :on-create-team="createTeam"
  />

  <SelectedTeamWorkspace
    v-if="selectedTeam"
    :key="selectedTeam.id"
    :organization-id="organizationId"
    :team-id="selectedTeam.id"
    :members="members"
    :members-pending="membersPending"
    :members-error="membersError"
    :can-manage-members="orgCapabilities?.canManageMembers"
    :invite-email="inviteEmail"
    :invite-role="inviteRole"
    :invite-pending="invitePending"
    :invite-error="inviteError"
    :member-label="memberLabel"
    :on-invite="inviteMember"
    :on-change-role="changeMemberRole"
    :on-add-to-team="addMemberToSelectedTeam"
    :on-remove-from-team="removeMemberFromSelectedTeam"
    :on-remove-member="removeMember"
    @update:invite-email="inviteEmail = $event"
    @update:invite-role="inviteRole = $event"
  />

  <OrganizationAuditSection
    v-if="orgCapabilities?.canViewOrgActivity"
    :organization-id="organizationId"
  />
</template>
