import { definePermission, derivePermissionMatrix } from '@lupinum/trellis/auth'

import { hasRole, hasWorkspace } from './checks'

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

export const commentCreate = definePermission({
  key: 'comment.create',
  label: 'Comment',
  roles: ['owner', 'admin', 'member', 'viewer'],
  check: hasWorkspace.and(hasRole('owner', 'admin', 'member', 'viewer')),
})

export const saasPermissions = [
  projectCreate,
  projectRead,
  projectArchive,
  projectExport,
  taskCreate,
  taskRead,
  taskAssign,
  commentCreate,
] as const

export type SaasPermissionKey = (typeof saasPermissions)[number]['key']

export const saasPermissionMatrix = derivePermissionMatrix(saasPermissions)
