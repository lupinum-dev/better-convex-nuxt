export const organizationRoles = ['owner', 'admin', 'member', 'viewer'] as const
export const inviteRoles = ['admin', 'member', 'viewer'] as const
export const organizationActivityRoles = ['owner', 'admin'] as const

export type OrganizationRole = (typeof organizationRoles)[number]
export type InviteRole = (typeof inviteRoles)[number]
export type OrganizationActivityRole = (typeof organizationActivityRoles)[number]

export function isOrganizationRole(role: unknown): role is OrganizationRole {
  return typeof role === 'string' && organizationRoles.includes(role as OrganizationRole)
}

export function isInviteRole(role: unknown): role is InviteRole {
  return typeof role === 'string' && inviteRoles.includes(role as InviteRole)
}

export function canAccessAllTeams(role: unknown): role is OrganizationActivityRole {
  return typeof role === 'string' && organizationActivityRoles.includes(role as OrganizationActivityRole)
}

export function canViewOrganizationActivity(role: unknown): role is OrganizationActivityRole {
  return canAccessAllTeams(role)
}
