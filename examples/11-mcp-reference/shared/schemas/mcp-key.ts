import { v } from 'convex/values'

import { defineArgs } from '../../../../src/runtime/schema/index'

export const mcpKeyRoleValidator = v.union(
  v.literal('owner'),
  v.literal('admin'),
  v.literal('member'),
  v.literal('viewer'),
)

export const createMcpKey = defineArgs({
  description: 'Create a bearer token for MCP clients.',
  args: {
    name: v.string(),
    role: mcpKeyRoleValidator,
    prefix: v.string(),
    hash: v.string(),
  },
})

export const revokeMcpKey = defineArgs({
  description: 'Revoke an MCP bearer token.',
  args: {
    id: v.id('mcpKeys'),
  },
})
