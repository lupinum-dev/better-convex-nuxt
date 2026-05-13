import { definePermission, buildPermissionMatrix } from '@lupinum/trellis/auth'

import { hasRole, hasWorkspace } from '../../auth/guards'

export const mcpManage = definePermission({
  key: 'mcp.manage',
  label: 'Manage MCP keys',
  roles: ['owner', 'admin'],
  check: hasWorkspace.and(hasRole('owner', 'admin')),
})

export const mcpKeyPermissions = [mcpManage] as const

export type McpKeyPermissionKey = (typeof mcpKeyPermissions)[number]['key']

export const mcpKeyPermissionMatrix = buildPermissionMatrix(mcpKeyPermissions)
