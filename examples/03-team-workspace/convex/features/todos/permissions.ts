import { definePermission, buildPermissionMatrix } from '@lupinum/trellis/auth'

import { hasRole, hasWorkspace } from '../../auth/guards'

export const todoRead = definePermission({
  key: 'todo.read',
  label: 'Read todos',
  roles: ['owner', 'admin', 'member', 'viewer'],
  check: hasWorkspace.and(hasRole('owner', 'admin', 'member', 'viewer')),
})

export const todoCreate = definePermission({
  key: 'todo.create',
  label: 'Create todo',
  roles: ['owner', 'admin', 'member'],
  check: hasWorkspace.and(hasRole('owner', 'admin', 'member')),
})

export const todoPermissions = [todoRead, todoCreate] as const
export const todoPermissionMatrix = buildPermissionMatrix(todoPermissions)
