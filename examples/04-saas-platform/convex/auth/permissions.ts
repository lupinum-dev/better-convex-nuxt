import { definePermission, derivePermissionMatrix } from '@lupinum/trellis/auth'

import {
  canArchiveProject,
  canAssignTask,
  canComment,
  canCreateProject,
  canCreateTask,
  canExportProjects,
  canManageMembers,
  canReadProject,
  canViewAudit,
  hasFeature,
} from './checks'

export const projectCreate = definePermission({
  key: 'project.create',
  label: 'Create project',
  roles: ['owner', 'admin'],
  check: canCreateProject,
})

export const projectRead = definePermission({
  key: 'project.read',
  label: 'Read projects',
  roles: ['owner', 'admin', 'member', 'viewer'],
  check: canReadProject,
})

export const projectArchive = definePermission({
  key: 'project.archive',
  label: 'Archive project',
  roles: ['owner', 'admin'],
  check: canArchiveProject,
})

export const projectExport = definePermission({
  key: 'project.export',
  label: 'Export projects (Pro/Enterprise)',
  roles: ['owner', 'admin'],
  description: 'Requires the exports feature on the current plan.',
  check: canExportProjects,
})

export const taskCreate = definePermission({
  key: 'task.create',
  label: 'Create task',
  roles: ['owner', 'admin', 'member'],
  check: canCreateTask,
})

export const taskAssign = definePermission({
  key: 'task.assign',
  label: 'Assign task',
  roles: ['owner', 'admin'],
  check: canAssignTask,
})

export const commentCreate = definePermission({
  key: 'comment.create',
  label: 'Comment',
  roles: ['owner', 'admin', 'member', 'viewer'],
  check: canComment,
})

export const workspaceMembers = definePermission({
  key: 'workspace.members',
  label: 'Manage members',
  roles: ['owner', 'admin'],
  check: canManageMembers,
})

export const workspaceAudit = definePermission({
  key: 'workspace.audit',
  label: 'View audit log',
  roles: ['owner', 'admin'],
  check: canViewAudit,
})

export const workspaceExports = definePermission({
  key: 'workspace.exports',
  label: 'Use export features (Pro/Enterprise)',
  roles: ['owner', 'admin'],
  description: 'Requires the exports feature on the current plan.',
  check: hasFeature('exports'),
})

export const saasPermissions = [
  projectCreate,
  projectRead,
  projectArchive,
  projectExport,
  taskCreate,
  taskAssign,
  commentCreate,
  workspaceMembers,
  workspaceAudit,
  workspaceExports,
] as const

export type SaasPermissionKey = (typeof saasPermissions)[number]['key']

export const saasPermissionMatrix = derivePermissionMatrix(saasPermissions)
