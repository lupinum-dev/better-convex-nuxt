import type { OrganizationRole } from '~~/shared/organizationRoles'

export type OrganizationSummary = {
  id: string
  name: string
  role?: OrganizationRole | null
}

export type Team = {
  id: string
  name: string
  organizationId: string
}

export type Member = {
  id: string
  organizationId: string
  userId: string
  role: OrganizationRole
  user?: {
    id: string
    email: string
    name: string
    image?: string
  }
}

export type OrganizationCapabilities = {
  role: OrganizationRole
  canManageOrganization: boolean
  canManageMembers: boolean
  canManageTeams: boolean
  canViewOrgActivity: boolean
  canCreateProject: boolean
  canDeleteProject: boolean
}

export type TeamCapabilities = {
  organizationId: string
  teamId: string
  canViewProjects: boolean
  canCreateProject: boolean
  canUpdateProject: boolean
  canDeleteProject: boolean
}
