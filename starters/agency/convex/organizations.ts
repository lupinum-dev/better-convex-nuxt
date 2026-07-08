import { ConvexError, v } from 'convex/values'

import { mutation } from './_generated/server'
import { requireCurrentUser } from './users'

export const create = mutation({
  args: {
    name: v.string(),
    kind: v.union(v.literal('agency'), v.literal('client')),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim()
    if (!name) {
      throw new ConvexError('Organization name is required')
    }

    const user = await requireCurrentUser(ctx)
    const now = Date.now()
    const organizationId = await ctx.db.insert('organizations', {
      name,
      kind: args.kind,
      createdBy: user._id,
      createdAt: now,
    })

    await ctx.db.insert('memberships', {
      organizationId,
      userId: user._id,
      role: 'owner',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })

    return organizationId
  },
})
