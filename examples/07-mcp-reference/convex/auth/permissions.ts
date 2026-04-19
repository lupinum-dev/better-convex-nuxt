import { definePermission, derivePermissionMatrix } from '@lupinum/trellis/auth'

import {
  canCreateRunbook,
  canManageMcpKeys,
  canReadWorkspaceRunbook,
  hasWorkspace,
} from './checks'

export const runbookRead = definePermission({
  key: 'runbook.read',
  label: 'Read runbooks',
  roles: ['owner', 'admin', 'member', 'viewer'],
  check: hasWorkspace.and(canReadWorkspaceRunbook),
})

export const runbookCreate = definePermission({
  key: 'runbook.create',
  label: 'Create runbook',
  roles: ['owner', 'admin', 'member'],
  check: hasWorkspace.and(canCreateRunbook),
})

export const runbookDelete = definePermission({
  key: 'runbook.delete',
  label: 'Delete own runbook',
  roles: ['owner', 'admin', 'member'],
  check: hasWorkspace.and(canCreateRunbook),
})

export const runbookBulkDelete = definePermission({
  key: 'runbook.bulkDelete',
  label: 'Bulk delete runbooks',
  roles: ['owner', 'admin'],
  check: hasWorkspace.and(canManageMcpKeys),
})

export const mcpManage = definePermission({
  key: 'mcp.manage',
  label: 'Manage MCP keys',
  roles: ['owner', 'admin'],
  check: hasWorkspace.and(canManageMcpKeys),
})

export const mcpReferencePermissions = [
  runbookRead,
  runbookCreate,
  runbookDelete,
  runbookBulkDelete,
  mcpManage,
] as const

export type McpReferencePermissionKey = (typeof mcpReferencePermissions)[number]['key']

export const mcpReferencePermissionMatrix = derivePermissionMatrix(mcpReferencePermissions)
