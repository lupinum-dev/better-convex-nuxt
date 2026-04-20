import { defineArgs } from '@lupinum/trellis/args'
import { v } from 'convex/values'

export const resolveMcpUserByEmail = defineArgs({
  description: 'Resolve an MCP demo identity to a workspace user by email.',
  args: {
    email: v.string(),
  },
})
