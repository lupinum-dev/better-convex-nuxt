import { ConvexError, v } from 'convex/values'

import { mutation } from './_generated/server'
import { requireOrganizationAdmin } from './access'

export const approveProjectDelete = mutation({
  args: {
    projectId: v.id('projects')
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId)
    if (!project) {
      throw new ConvexError('Project not found')
    }

    const user = await requireOrganizationAdmin(ctx, project.organizationId)
    const now = Date.now()
    return await ctx.db.insert('approvals', {
      organizationId: project.organizationId,
      operation: 'projects.delete',
      resourceId: args.projectId,
      status: 'approved',
      approvedBy: user._id,
      expiresAt: now + 5 * 60 * 1000,
      createdAt: now
    })
  }
})
