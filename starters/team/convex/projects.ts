import { ConvexError, v } from 'convex/values'

import { mutation, query } from './_generated/server'
import { requireOrgAccess } from './access'
import { writeAuditEvent } from './audit'

export const list = query({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: async (ctx, args) => {
    await requireOrgAccess(ctx, args.organizationId)
    return await ctx.db
      .query('projects')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .order('desc')
      .take(100)
  },
})

export const create = mutation({
  args: {
    organizationId: v.id('organizations'),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim()
    if (!name) {
      throw new ConvexError('Project name is required')
    }

    const { user } = await requireOrgAccess(ctx, args.organizationId, 'member')
    const projectId = await ctx.db.insert('projects', {
      organizationId: args.organizationId,
      name,
      createdBy: user._id,
      createdAt: Date.now(),
    })

    await writeAuditEvent(ctx, {
      organizationId: args.organizationId,
      actorUserId: user._id,
      action: 'projects.create',
      resourceType: 'project',
      resourceId: projectId,
    })

    return projectId
  },
})
