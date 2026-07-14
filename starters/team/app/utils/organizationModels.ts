import type { InviteRole, OrganizationRole } from '~~/shared/organizationRoles'

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
  isTeamMember: boolean
}

export type PendingInvitation = {
  email: string
  role: InviteRole
  teamId?: string
  teamName?: string
  status: string
  expiresAt: number
  createdAt: number
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
