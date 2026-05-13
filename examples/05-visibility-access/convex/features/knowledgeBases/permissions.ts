import { definePermission, buildPermissionMatrix } from '@lupinum/trellis/auth'

import { hasRole, hasWorkspace } from '../../auth/guards'

export const kbCreate = definePermission({
  key: 'kb.create',
  label: 'Create knowledge base',
  roles: ['owner', 'admin', 'editor'],
  check: hasWorkspace.and(hasRole('owner', 'admin', 'editor')),
})

export const kbRead = definePermission({
  key: 'kb.read',
  label: 'Read knowledge base',
  roles: ['owner', 'admin', 'editor', 'contributor', 'viewer'],
  check: hasWorkspace.and(hasRole('owner', 'admin', 'editor', 'contributor', 'viewer')),
})

export const enrollmentManage = definePermission({
  key: 'enrollment.manage',
  label: 'Manage enrollments',
  roles: ['owner', 'admin', 'editor'],
  check: hasWorkspace.and(hasRole('owner', 'admin', 'editor')),
})

export const knowledgeBasePermissions = [kbCreate, kbRead, enrollmentManage] as const

export const knowledgeBasePermissionMatrix = buildPermissionMatrix(knowledgeBasePermissions)
