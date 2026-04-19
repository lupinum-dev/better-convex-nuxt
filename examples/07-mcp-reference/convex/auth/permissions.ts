import { definePermission, derivePermissionMatrix } from '@lupinum/trellis/auth'

import { hasRole, hasWorkspace } from './checks'

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

export const mcpManage = definePermission({
  key: 'mcp.manage',
  label: 'Manage MCP keys',
  roles: ['owner', 'admin'],
  check: hasWorkspace.and(hasRole('owner', 'admin')),
})

export const mcpReferencePermissions = [
  runbookRead,
  runbookCreate,
  runbookDelete,
  runbookPublish,
  runbookBulkDelete,
  mcpManage,
] as const

export type McpReferencePermissionKey = (typeof mcpReferencePermissions)[number]['key']

export const mcpReferencePermissionMatrix = derivePermissionMatrix(mcpReferencePermissions)
