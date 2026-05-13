import { definePermission, buildPermissionMatrix } from '@lupinum/trellis/auth'

import { hasRole, hasWorkspace } from '../../auth/guards'

export const commentCreate = definePermission({
  key: 'comment.create',
  label: 'Comment',
  roles: ['owner', 'admin', 'member', 'viewer'],
  check: hasWorkspace.and(hasRole('owner', 'admin', 'member', 'viewer')),
})

export const commentPermissions = [commentCreate] as const

export const commentPermissionMatrix = buildPermissionMatrix(commentPermissions)
