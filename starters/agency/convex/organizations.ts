import { ConvexError, v } from 'convex/values'

import { mutation } from './_generated/server'
import { writeAuditEvent } from './audit'
import { requireCurrentUser } from './users'

export const create = mutation({
  args: {
    name: v.string(),
    kind: v.union(v.literal('agency'), v.literal('client')),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim()
    if (!name || name.length > 120) {
      throw new ConvexError('Organization name must be between 1 and 120 characters')
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

    await writeAuditEvent(ctx, {
      organizationId,
      actorUserId: user._id,
      accessPath: 'direct',
      action: 'organizations.create',
      resourceType: 'organization',
      resourceId: organizationId,
    })

    return organizationId
  },
})
