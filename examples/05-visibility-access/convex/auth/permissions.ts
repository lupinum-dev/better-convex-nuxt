import { definePermission, derivePermissionMatrix } from '@lupinum/trellis/auth'

import { hasRole } from './checks'

export const kbCreate = definePermission({
  key: 'kb.create',
  label: 'Create knowledge base',
  roles: ['owner', 'admin', 'editor'],
  check: hasRole('owner', 'admin', 'editor'),
})

export const kbRead = definePermission({
  key: 'kb.read',
  label: 'Read knowledge base',
  roles: ['owner', 'admin', 'editor', 'contributor', 'viewer'],
  check: hasRole('owner', 'admin', 'editor', 'contributor', 'viewer'),
})

export const articleCreate = definePermission({
  key: 'article.create',
  label: 'Create article',
  roles: ['owner', 'admin', 'editor', 'contributor'],
  check: hasRole('owner', 'admin', 'editor', 'contributor'),
})

export const articleRead = definePermission({
  key: 'article.read',
  label: 'Read articles',
  roles: ['owner', 'admin', 'editor', 'contributor', 'viewer'],
  check: hasRole('owner', 'admin', 'editor', 'contributor', 'viewer'),
})

export const enrollmentManage = definePermission({
  key: 'enrollment.manage',
  label: 'Manage enrollments',
  roles: ['owner', 'admin', 'editor'],
  check: hasRole('owner', 'admin', 'editor'),
})

export const shareCreate = definePermission({
  key: 'share.create',
  label: 'Create share token',
  roles: ['owner', 'admin', 'editor'],
  check: hasRole('owner', 'admin', 'editor'),
})

export const knowledgeBasePermissions = [
  kbCreate,
  kbRead,
  articleCreate,
  articleRead,
  enrollmentManage,
  shareCreate,
] as const

export type KnowledgeBasePermissionKey = (typeof knowledgeBasePermissions)[number]['key']

export const knowledgeBasePermissionMatrix = derivePermissionMatrix(knowledgeBasePermissions)
