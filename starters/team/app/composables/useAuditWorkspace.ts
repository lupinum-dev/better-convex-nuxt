import type { ComputedRef, Ref } from 'vue'

import { api } from '#convex/api'

import type { TeamOrganization } from './useTeamAuthClient'

type OrganizationCapabilities = {
  canViewOrgActivity?: boolean
}

type TeamCapabilities = {
  canViewProjects?: boolean
}

export async function useAuditWorkspace(args: {
  organizationId: ComputedRef<string>
  organization: ComputedRef<TeamOrganization | null>
  selectedTeamId: Ref<string | null>
  orgCapabilities: Ref<OrganizationCapabilities | null | undefined>
  teamCapabilities: Ref<TeamCapabilities | null | undefined>
}) {
  const nuxtApp = useNuxtApp()
  const orgAuditArgs = computed(() =>
    args.organization.value && args.orgCapabilities.value?.canViewOrgActivity
      ? { organizationId: args.organizationId.value }
      : 'skip',
  )
  const {
    results: orgAuditEvents,
    status: orgAuditStatus,
    loadMore: loadMoreOrgAudit,
  } = await nuxtApp.runWithContext(() =>
    useConvexPaginatedQuery(api.audit.listForOrganization, orgAuditArgs, {
      initialNumItems: 10,
    }),
  )

  const teamAuditArgs = computed(() =>
    args.selectedTeamId.value && args.teamCapabilities.value?.canViewProjects
      ? { teamId: args.selectedTeamId.value }
      : 'skip',
  )
  const {
    results: teamAuditEvents,
    status: teamAuditStatus,
    loadMore: loadMoreTeamAudit,
  } = await nuxtApp.runWithContext(() =>
    useConvexPaginatedQuery(api.audit.listForTeam, teamAuditArgs, {
      initialNumItems: 10,
    }),
  )

  function formatAuditTime(createdAt: number) {
    return new Date(createdAt).toLocaleString()
  }

  return {
    orgAuditEvents,
    orgAuditStatus,
    loadMoreOrgAudit,
    teamAuditEvents,
    teamAuditStatus,
    loadMoreTeamAudit,
    formatAuditTime,
  }
}
