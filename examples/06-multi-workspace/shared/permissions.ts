export const agencyPermissionKeys = {
  projectCreate: 'project.create',
  agencyDashboard: 'agency.dashboard',
} as const

export type AgencyPermissionKey = (typeof agencyPermissionKeys)[keyof typeof agencyPermissionKeys]

export type AgencyPermissionMap = Record<AgencyPermissionKey, boolean>
