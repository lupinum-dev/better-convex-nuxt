import { definePermission, derivePermissionMatrix } from '@lupinum/trellis/auth'

import { hasRole } from './checks'

export const projectRead = definePermission({
  key: 'project.read',
  label: 'Read projects',
  roles: ['owner', 'member', 'viewer', 'agency_admin', 'agency_manager'],
  check: hasRole('owner', 'member', 'viewer', 'agency_admin', 'agency_manager'),
})

export const projectCreate = definePermission({
  key: 'project.create',
  label: 'Create project',
  roles: ['owner', 'member'],
  check: hasRole('owner', 'member'),
})

export const agencyPermissions = [projectRead, projectCreate] as const

export type AgencyPermissionKey = (typeof agencyPermissions)[number]['key']

export const agencyPermissionMatrix = derivePermissionMatrix(agencyPermissions)
