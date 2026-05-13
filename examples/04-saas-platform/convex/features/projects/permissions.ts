import { definePermission, buildPermissionMatrix } from '@lupinum/trellis/auth'

import { hasRole, hasWorkspace } from '../../auth/guards'

export const projectCreate = definePermission({
  key: 'project.create',
  label: 'Create project',
  roles: ['owner', 'admin'],
  check: hasWorkspace.and(hasRole('owner', 'admin')),
})

export const projectRead = definePermission({
  key: 'project.read',
  label: 'Read projects',
  roles: ['owner', 'admin', 'member', 'viewer'],
  check: hasWorkspace.and(hasRole('owner', 'admin', 'member', 'viewer')),
})

export const projectArchive = definePermission({
  key: 'project.archive',
  label: 'Archive project',
  roles: ['owner', 'admin'],
  check: hasWorkspace.and(hasRole('owner', 'admin')),
})

export const projectExport = definePermission({
  key: 'project.export',
  label: 'Export projects',
  roles: ['owner', 'admin'],
  check: hasWorkspace.and(hasRole('owner', 'admin')),
})

export const projectPermissions = [
  projectCreate,
  projectRead,
  projectArchive,
  projectExport,
] as const

export const projectPermissionMatrix = buildPermissionMatrix(projectPermissions)
