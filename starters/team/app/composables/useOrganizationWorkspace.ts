import type { ComputedRef } from 'vue'

import { useAuditWorkspace } from './useAuditWorkspace'
import { useOrganizationManagement } from './useOrganizationManagement'
import { useProjectWorkspace } from './useProjectWorkspace'
import type { TeamOrganization } from './useTeamAuthClient'

export async function useOrganizationWorkspace(args: {
  organizationId: ComputedRef<string>
  organization: ComputedRef<TeamOrganization | null>
  organizationState: ReturnType<typeof useTeamOrganizations>
  isAuthenticated: ComputedRef<boolean>
}) {
  const management = await useOrganizationManagement(args)
  const projects = await useProjectWorkspace({
    selectedTeamId: management.selectedTeamId,
    teamCapabilities: management.teamCapabilities,
  })
  const audit = await useAuditWorkspace({
    organizationId: args.organizationId,
    organization: args.organization,
    selectedTeamId: management.selectedTeamId,
    orgCapabilities: management.orgCapabilities,
    teamCapabilities: management.teamCapabilities,
  })

  return {
    ...management,
    ...projects,
    ...audit,
  }
}

export type OrganizationWorkspace = Awaited<ReturnType<typeof useOrganizationWorkspace>>
