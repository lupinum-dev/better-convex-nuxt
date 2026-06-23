import { ConvexError, v } from 'convex/values'

import { internalMutation } from './_generated/server'

export const createProjectWithOAuthToken = internalMutation({
  args: {
    tokenId: v.string(),
    clientId: v.string(),
    userId: v.string(),
    organizationId: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim()
    if (!name) {
      throw new ConvexError('Project name is required')
    }

    const actor = `oauth:${args.tokenId}`
    const projectId = await ctx.db.insert('projects', {
      organizationId: args.organizationId,
      name,
      createdByAuthUserId: actor,
      createdAt: Date.now(),
    })

    await ctx.db.insert('auditEvents', {
      organizationId: args.organizationId,
      actorAuthUserId: actor,
      action: 'projects.createFromOAuthToken',
      resourceType: 'project',
      resourceId: projectId,
      createdAt: Date.now(),
    })

    return {
      projectId,
      tokenId: args.tokenId,
      clientId: args.clientId,
      userId: args.userId,
    }
  },
})
