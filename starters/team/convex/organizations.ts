import { ConvexError, v } from 'convex/values'

import { mutation, query } from './_generated/server'
import { requireOrgAccess } from './access'
import { writeAuditEvent } from './audit'
import { getCurrentUserOrNull, requireCurrentUser } from './users'

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

    await writeAuditEvent(ctx, {
      organizationId,
      actorUserId: user._id,
      action: 'organizations.create',
      resourceType: 'organization',
      resourceId: organizationId,
    })

    return organizationId
  },
})

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserOrNull(ctx)
    if (!user) {
      return []
    }

    const memberships = await ctx.db
      .query('memberships')
      .withIndex('by_user_status', (q) => q.eq('userId', user._id).eq('status', 'active'))
      .take(100)

    const rows = []
    for (const membership of memberships) {
      const organization = await ctx.db.get(membership.organizationId)
      if (organization) {
        rows.push({ ...organization, role: membership.role })
      }
    }

    return rows
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
