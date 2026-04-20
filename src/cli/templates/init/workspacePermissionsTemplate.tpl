import { definePermission } from '@lupinum/trellis/auth'

import { hasMinimumRole, hasWorkspace, isAuthenticated } from './checks'

export const workspaceRead = definePermission({
  key: 'workspace.read',
  check: isAuthenticated,
})

export const workspaceMembers = definePermission({
  key: 'workspace.members',
  check: hasWorkspace.and(hasMinimumRole('admin')),
})

export const todoCreate = definePermission({
  key: 'todo.create',
  check: hasWorkspace.and(hasMinimumRole('member')),
})

export const workspacePermissions = [workspaceRead, workspaceMembers, todoCreate] as const
