import { definePermission, buildPermissionMatrix } from '@lupinum/trellis/auth'

import { hasRole, hasWorkspace } from '../../auth/guards'

export const articleCreate = definePermission({
  key: 'article.create',
  label: 'Create article',
  roles: ['owner', 'admin', 'editor', 'contributor'],
  check: hasWorkspace.and(hasRole('owner', 'admin', 'editor', 'contributor')),
})

export const articleRead = definePermission({
  key: 'article.read',
  label: 'Read articles',
  roles: ['owner', 'admin', 'editor', 'contributor', 'viewer'],
  check: hasWorkspace.and(hasRole('owner', 'admin', 'editor', 'contributor', 'viewer')),
})

export const shareCreate = definePermission({
  key: 'share.create',
  label: 'Create share token',
  roles: ['owner', 'admin', 'editor'],
  check: hasWorkspace.and(hasRole('owner', 'admin', 'editor')),
})

export const articlePermissions = [articleCreate, articleRead, shareCreate] as const

export const articlePermissionMatrix = buildPermissionMatrix(articlePermissions)
