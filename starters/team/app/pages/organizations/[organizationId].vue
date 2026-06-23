<script setup lang="ts">
const route = useRoute()
const organizationId = computed(() => route.params.organizationId as string)
const { isAuthenticated, isPending } = useConvexAuth()
const organizationState = useTeamOrganizations()

const organizations = computed(() => organizationState.value.data ?? [])
const organization = computed(
  () => organizations.value.find((org) => org.id === organizationId.value) ?? null,
)
const organizationPending = computed(
  () => organizationState.value.isPending || organizationState.value.isRefetching,
)

const workspace = await useOrganizationWorkspace({
  organizationId,
  organization,
  organizationState,
  isAuthenticated,
})

const {
  teams,
  selectedTeamId,
  teamsPending,
  teamsError,
  teamName,
  teamRenameName,
  teamCreatePending,
  teamCreateError,
  statusFilter,
  orgName,
  orgRenamePending,
  orgRenameError,
  teamRenamePending,
  teamRenameError,
  members,
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
  projects,
  projectStatus,
  projectsLoading,
  orgAuditEvents,
  orgAuditStatus,
  loadMoreOrgAudit,
  teamAuditEvents,
  teamAuditStatus,
  loadMoreTeamAudit,
  loadMoreProjects,
  formatAuditTime,
  createTeam,
  renameOrganization,
  renameSelectedTeam,
  inviteMember,
  changeMemberRole,
  removeMember,
  addMemberToSelectedTeam,
  removeMemberFromSelectedTeam,
  memberLabel,
  renameSelectedProject,
  deleteSelectedProject,
  restoreSelectedProject,
} = workspace
</script>

<template>
  <main class="shell">
    <NuxtLink class="back-link" to="/">Organizations</NuxtLink>
    <section class="header">
      <p>{{ organization?.name ?? 'Organization' }}</p>
      <h1>Projects</h1>
    </section>

    <section v-if="isPending" class="empty">Checking session...</section>

    <AuthPanel
      v-else-if="!isAuthenticated"
      message="Create an account or sign in to manage projects."
    />

    <section v-else-if="organizationPending" class="empty">Loading organization...</section>

    <section v-else-if="!organization" class="empty">Organization not found.</section>

    <template v-else>
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

      <template v-if="selectedTeam">
        <MembersPanel
          v-model:invite-email="inviteEmail"
          v-model:invite-role="inviteRole"
          :can-manage-members="orgCapabilities?.canManageMembers"
          :members="members"
          :selected-team-member-user-ids="selectedTeamMemberUserIds"
          :selected-team-id="selectedTeamId"
          :invite-pending="invitePending"
          :invite-error="inviteError"
          :members-pending="membersPending"
          :members-error="membersError"
          :team-members-error="teamMembersError"
          :member-label="memberLabel"
          :on-invite="inviteMember"
          :on-change-role="changeMemberRole"
          :on-add-to-team="addMemberToSelectedTeam"
          :on-remove-from-team="removeMemberFromSelectedTeam"
          :on-remove-member="removeMember"
        />

        <ProjectsPanel
          v-if="teamCapabilities?.canViewProjects"
          v-model:status-filter="statusFilter"
          :team-id="selectedTeam.id"
          :projects="projects"
          :projects-loading="projectsLoading"
          :project-status="projectStatus"
          :can-create-project="teamCapabilities?.canCreateProject"
          :can-update-project="teamCapabilities?.canUpdateProject"
          :can-delete-project="teamCapabilities?.canDeleteProject"
          :on-load-more="loadMoreProjects"
          :on-rename="renameSelectedProject"
          :on-delete="deleteSelectedProject"
          :on-restore="restoreSelectedProject"
        />

        <AuditPanel
          v-if="teamCapabilities?.canViewProjects"
          title="Team activity"
          :events="teamAuditEvents"
          :status="teamAuditStatus"
          :format-time="formatAuditTime"
          :on-load-more="loadMoreTeamAudit"
        />
      </template>

      <AuditPanel
        v-if="orgCapabilities?.canViewOrgActivity"
        title="Organization activity"
        :events="orgAuditEvents"
        :status="orgAuditStatus"
        :format-time="formatAuditTime"
        :on-load-more="loadMoreOrgAudit"
      />
    </template>
  </main>
</template>
