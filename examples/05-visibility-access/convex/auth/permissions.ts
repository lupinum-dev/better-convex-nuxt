import { definePermission, derivePermissionMatrix } from '@lupinum/trellis/auth'

import {
  canCreateArticle,
  canCreateKB,
  canCreateShareToken,
  canManageEnrollments,
  canReadArticle,
  canReadKB,
} from './checks'

export const kbCreate = definePermission({
  key: 'kb.create',
  label: 'Create knowledge base',
  roles: ['owner', 'admin', 'editor'],
  check: canCreateKB,
})

export const kbRead = definePermission({
  key: 'kb.read',
  label: 'Read knowledge base',
  roles: ['owner', 'admin', 'editor', 'contributor', 'viewer'],
  check: canReadKB,
})

export const articleCreate = definePermission({
  key: 'article.create',
  label: 'Create article',
  roles: ['owner', 'admin', 'editor', 'contributor'],
  check: canCreateArticle,
})

export const articleRead = definePermission({
  key: 'article.read',
  label: 'Read articles',
  roles: ['owner', 'admin', 'editor', 'contributor', 'viewer'],
  check: canReadArticle,
})

export const enrollmentManage = definePermission({
  key: 'enrollment.manage',
  label: 'Manage enrollments',
  roles: ['owner', 'admin', 'editor'],
  check: canManageEnrollments,
})

export const shareCreate = definePermission({
  key: 'share.create',
  label: 'Create share token',
  roles: ['owner', 'admin', 'editor'],
  check: canCreateShareToken,
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
