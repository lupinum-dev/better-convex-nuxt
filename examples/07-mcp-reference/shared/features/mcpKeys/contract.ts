import { defineArgs } from '@lupinum/trellis/args'
import { v } from 'convex/values'

export const createMcpKey = defineArgs({
  description: 'Create a bearer token for MCP clients.',
  args: {
    name: v.string(),
    boundAuthId: v.string(),
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
