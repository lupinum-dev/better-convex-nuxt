import { ConvexError, v } from 'convex/values'

import { mutation, query } from './_generated/server'
import { requireOrgAccess } from './access'
import { requireCurrentUser } from './users'

export const create = mutation({
  args: {
    name: v.string(),
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

export const get = query({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    await requireOrgAccess(ctx, args.organizationId)
    return await ctx.db.get(args.organizationId)
  },
})
