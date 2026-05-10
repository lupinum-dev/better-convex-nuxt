import { definePermission } from '@lupinum/trellis/auth'

import { hasMinimumRole, hasWorkspace } from '../../auth/guards'

export const workspaceRead = definePermission({
  key: 'workspace.read',
  check: hasWorkspace,
})

export const todoCreate = definePermission({
  key: 'todo.create',
  check: hasWorkspace.and(hasMinimumRole('member')),
})

export const todoPermissions = [workspaceRead, todoCreate] as const
