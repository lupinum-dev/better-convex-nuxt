import { definePermission, buildPermissionMatrix } from '@lupinum/trellis/auth'

import { hasRole, hasWorkspace } from '../../auth/guards'

export const taskCreate = definePermission({
  key: 'task.create',
  label: 'Create task',
  roles: ['owner', 'admin', 'member'],
  check: hasWorkspace.and(hasRole('owner', 'admin', 'member')),
})

export const taskRead = definePermission({
  key: 'task.read',
  label: 'Read tasks',
  roles: ['owner', 'admin', 'member', 'viewer'],
  project: false,
  check: hasWorkspace.and(hasRole('owner', 'admin', 'member', 'viewer')),
})

export const taskAssign = definePermission({
  key: 'task.assign',
  label: 'Assign task',
  roles: ['owner', 'admin'],
  check: hasWorkspace.and(hasRole('owner', 'admin')),
})

export const taskPermissions = [taskCreate, taskRead, taskAssign] as const

export const taskPermissionMatrix = buildPermissionMatrix(taskPermissions)
