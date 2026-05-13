import { definePermission, buildPermissionMatrix } from '@lupinum/trellis/auth'

import { hasRole } from '../../auth/guards'

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

export const projectPermissions = [projectRead, projectCreate] as const
export const projectPermissionMatrix = buildPermissionMatrix(projectPermissions)
