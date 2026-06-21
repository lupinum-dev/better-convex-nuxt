import { v } from 'convex/values'

import { action } from './_generated/server'

export const recordUsage = action({
  args: {
    organizationId: v.id('organizations'),
    toolName: v.string()
  },
  handler: async (_ctx, args) => {
    return {
      organizationId: args.organizationId,
      toolName: args.toolName,
      recorded: true
    }
  }
})

