export const mcpReferencePermissionKeys = {
  runbookRead: 'runbook.read',
  runbookCreate: 'runbook.create',
  mcpManage: 'mcp.manage',
} as const

export type McpReferencePermissionKey =
  (typeof mcpReferencePermissionKeys)[keyof typeof mcpReferencePermissionKeys]

export type McpReferencePermissionMap = Record<McpReferencePermissionKey, boolean>
