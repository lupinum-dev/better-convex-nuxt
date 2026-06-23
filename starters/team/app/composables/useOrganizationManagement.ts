import type { ComputedRef } from 'vue'
import type { InviteRole, OrganizationRole } from '~~/shared/organizationRoles'

import { api } from '#convex/api'
import {
  parseMembersResponse,
  parseTeam,
  parseTeamMembers,
  parseTeams,
  type Member,
  type Team,
  type TeamMember,
} from '~/utils/managementResponses'

import type { TeamOrganization } from './useTeamAuthClient'

export async function useOrganizationManagement(args: {
  organizationId: ComputedRef<string>
  organization: ComputedRef<TeamOrganization | null>
  organizationState: ReturnType<typeof useTeamOrganizations>
  isAuthenticated: ComputedRef<boolean>
}) {
  const nuxtApp = useNuxtApp()
  const teams = ref<Team[]>([])
  const selectedTeamId = ref<string | null>(null)
  const teamsPending = ref(false)
  const teamsError = ref<string | null>(null)
  const teamName = ref('')
  const teamRenameName = ref('')
  const teamCreatePending = ref(false)
  const teamCreateError = ref<string | null>(null)
  const orgName = ref('')
  const orgRenamePending = ref(false)
  const orgRenameError = ref<string | null>(null)
  const teamRenamePending = ref(false)
  const teamRenameError = ref<string | null>(null)
  const members = ref<Member[]>([])
  const teamMembers = ref<TeamMember[]>([])
  const membersPending = ref(false)
  const membersError = ref<string | null>(null)
  const teamMembersError = ref<string | null>(null)
  const inviteEmail = ref('')
  const inviteRole = ref<InviteRole>('member')
  const invitePending = ref(false)
  const inviteError = ref<string | null>(null)

  const selectedTeam = computed(
    () => teams.value.find((team) => team.id === selectedTeamId.value) ?? null,
  )
  const selectedTeamMemberUserIds = computed(
    () => new Set(teamMembers.value.map((member) => member.userId)),
  )

  const orgCapabilityArgs = computed(() =>
    args.organization.value ? { organizationId: args.organizationId.value } : 'skip',
  )
  const { data: orgCapabilities } = await nuxtApp.runWithContext(() =>
    useConvexQuery(api.organizationAccess.getCapabilities, orgCapabilityArgs),
  )

  const teamCapabilityArgs = computed(() =>
    selectedTeamId.value ? { teamId: selectedTeamId.value } : 'skip',
  )
  const { data: teamCapabilities } = await nuxtApp.runWithContext(() =>
    useConvexQuery(api.teamAccess.getCapabilities, teamCapabilityArgs),
  )

  async function refreshTeams() {
    if (import.meta.server) return
    if (!args.isAuthenticated.value) return

    teamsPending.value = true
    teamsError.value = null
    try {
      teams.value = parseTeams(
        await $fetch(`/api/organizations/${args.organizationId.value}/teams`),
      )
      if (!selectedTeamId.value || !teams.value.some((team) => team.id === selectedTeamId.value)) {
        const firstTeam = teams.value.at(0) ?? null
        selectedTeamId.value = firstTeam?.id ?? null
      }
    } catch (e) {
      teamsError.value = e instanceof Error ? e.message : 'Teams could not be loaded'
    } finally {
      teamsPending.value = false
    }
  }

  async function refreshMembers() {
    if (import.meta.server) return
    if (!args.isAuthenticated.value || !args.organization.value) return

    membersPending.value = true
    membersError.value = null
    try {
      members.value = parseMembersResponse(
        await $fetch(`/api/organizations/${args.organizationId.value}/members`),
      )
    } catch (e) {
      membersError.value = e instanceof Error ? e.message : 'Members could not be loaded'
    } finally {
      membersPending.value = false
    }
  }

  async function refreshTeamMembers() {
    if (import.meta.server) return
    if (!selectedTeamId.value) {
      teamMembers.value = []
      teamMembersError.value = null
      return
    }

    teamMembersError.value = null
    try {
      teamMembers.value = parseTeamMembers(
        await $fetch(`/api/teams/${selectedTeamId.value}/members`),
      )
    } catch (e) {
      teamMembers.value = []
      teamMembersError.value = e instanceof Error ? e.message : 'Team members could not be loaded'
    }
  }

  watch(
    [args.isAuthenticated, args.organizationId],
    () => {
      void refreshTeams()
      void refreshMembers()
    },
    { immediate: true },
  )

  watch(selectedTeamId, () => {
    void refreshTeamMembers()
  })

  watch(
    selectedTeam,
    (team) => {
      teamRenameName.value = team?.name ?? ''
    },
    { immediate: true },
  )

  watch(
    args.organization,
    (nextOrganization) => {
      orgName.value = nextOrganization?.name ?? ''
    },
    { immediate: true },
  )

  async function createTeam() {
    const name = teamName.value.trim()
    if (!name) return

    teamCreatePending.value = true
    teamCreateError.value = null
    try {
      const team = parseTeam(
        await $fetch(`/api/organizations/${args.organizationId.value}/teams`, {
          method: 'POST',
          body: { name },
        }),
      )
      teamName.value = ''
      await refreshTeams()
      selectedTeamId.value = team.id
    } catch (e) {
      teamCreateError.value = e instanceof Error ? e.message : 'Team was not created'
    } finally {
      teamCreatePending.value = false
    }
  }

  async function renameOrganization() {
    const name = orgName.value.trim()
    if (!name || !args.organization.value || name === args.organization.value.name) return

    orgRenamePending.value = true
    orgRenameError.value = null
    try {
      await $fetch(`/api/organizations/${args.organizationId.value}/rename`, {
        method: 'POST',
        body: { name },
      })
      await args.organizationState.value.refetch()
    } catch (e) {
      orgRenameError.value = e instanceof Error ? e.message : 'Organization was not renamed'
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
      await $fetch(`/api/teams/${selectedTeam.value.id}/rename`, {
        method: 'POST',
        body: { name: nextName },
      })
      await refreshTeams()
    } catch (e) {
      teamRenameError.value = e instanceof Error ? e.message : 'Team was not renamed'
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
      await $fetch(`/api/organizations/${args.organizationId.value}/members/invite`, {
        method: 'POST',
        body: {
          email,
          role: inviteRole.value,
          teamId: selectedTeamId.value,
        },
      })
      inviteEmail.value = ''
      await refreshMembers()
      await refreshTeamMembers()
    } catch (e) {
      inviteError.value = e instanceof Error ? e.message : 'Member was not invited'
    } finally {
      invitePending.value = false
    }
  }

  async function changeMemberRole(member: Member, role: OrganizationRole) {
    if (role === member.role) return

    await $fetch(`/api/organizations/${args.organizationId.value}/members/${member.id}/role`, {
      method: 'POST',
      body: { role },
    })
    await refreshMembers()
  }

  async function removeMember(member: Member) {
    await $fetch(`/api/organizations/${args.organizationId.value}/members/${member.id}/remove`, {
      method: 'POST',
    })
    await refreshMembers()
    await refreshTeamMembers()
  }

  async function addMemberToSelectedTeam(member: Member) {
    if (!selectedTeamId.value) return

    await $fetch(`/api/teams/${selectedTeamId.value}/members/add`, {
      method: 'POST',
      body: {
        userId: member.userId,
      },
    })
    await refreshTeamMembers()
  }

  async function removeMemberFromSelectedTeam(member: Member) {
    if (!selectedTeamId.value) return

    await $fetch(`/api/teams/${selectedTeamId.value}/members/remove`, {
      method: 'POST',
      body: {
        userId: member.userId,
      },
    })
    await refreshTeamMembers()
  }

  function memberLabel(member: Member) {
    return member.user?.name || member.user?.email || member.userId
  }

  return {
    teams,
    selectedTeamId,
    teamsPending,
    teamsError,
    teamName,
    teamRenameName,
    teamCreatePending,
    teamCreateError,
    orgName,
    orgRenamePending,
    orgRenameError,
    teamRenamePending,
    teamRenameError,
    members,
    teamMembers,
    membersPending,
    membersError,
    teamMembersError,
    inviteEmail,
    inviteRole,
    invitePending,
    inviteError,
    selectedTeam,
    selectedTeamMemberUserIds,
    orgCapabilities,
    teamCapabilities,
    createTeam,
    renameOrganization,
    renameSelectedTeam,
    inviteMember,
    changeMemberRole,
    removeMember,
    addMemberToSelectedTeam,
    removeMemberFromSelectedTeam,
    memberLabel,
  }
}
