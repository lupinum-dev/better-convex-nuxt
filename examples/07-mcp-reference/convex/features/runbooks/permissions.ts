import { definePermission, buildPermissionMatrix } from '@lupinum/trellis/auth'

import { hasRole, hasWorkspace } from '../../auth/guards'

export const runbookRead = definePermission({
  key: 'runbook.read',
  label: 'Read runbooks',
  roles: ['owner', 'admin', 'member', 'viewer'],
  check: hasWorkspace.and(hasRole('owner', 'admin', 'member', 'viewer')),
})

export const runbookCreate = definePermission({
  key: 'runbook.create',
  label: 'Create runbook',
  roles: ['owner', 'admin', 'member'],
  check: hasWorkspace.and(hasRole('owner', 'admin', 'member')),
})

export const runbookDelete = definePermission({
  key: 'runbook.delete',
  label: 'Delete own runbook',
  roles: ['owner', 'admin', 'member'],
  project: false,
  check: hasWorkspace.and(hasRole('owner', 'admin', 'member')),
})

export const runbookPublish = definePermission({
  key: 'runbook.publish',
  label: 'Publish runbook',
  roles: ['owner', 'admin'],
  project: false,
  check: hasWorkspace.and(hasRole('owner', 'admin')),
})

export const runbookBulkDelete = definePermission({
  key: 'runbook.bulkDelete',
  label: 'Bulk delete runbooks',
  roles: ['owner', 'admin'],
  check: hasWorkspace.and(hasRole('owner', 'admin')),
})

export const runbookPermissions = [
  runbookRead,
  runbookCreate,
  runbookDelete,
  runbookPublish,
  runbookBulkDelete,
] as const

export type RunbookPermissionKey = (typeof runbookPermissions)[number]['key']

export const runbookPermissionMatrix = buildPermissionMatrix(runbookPermissions)
