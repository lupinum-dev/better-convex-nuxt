import { v } from 'convex/values'

import { mutation } from './_generated/server'

export const createApprovedForDemo = mutation({
  args: {
    organizationId: v.id('organizations'),
    operation: v.string(),
    resourceId: v.string()
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('approvals', {
      organizationId: args.organizationId,
      operation: args.operation,
      resourceId: args.resourceId,
      status: 'approved',
      expiresAt: Date.now() + 5 * 60 * 1000,
      createdAt: Date.now()
    })
  }
})

