import { ConvexError, v } from 'convex/values'

import { mutation, query } from './_generated/server'
import { requireServiceActor, writeServiceAudit } from './access'

export const listForServiceActor = query({
  args: {
    credentialHash: v.string(),
    organizationId: v.id('organizations')
  },
  handler: async (ctx, args) => {
    await requireServiceActor(ctx, args)
    return await ctx.db
      .query('projects')
      .withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
      .order('desc')
      .collect()
  }
})

export const createFromServiceActor = mutation({
  args: {
    credentialHash: v.string(),
    organizationId: v.id('organizations'),
    name: v.string()
  },
  handler: async (ctx, args) => {
    const name = args.name.trim()
    if (!name) {
      throw new ConvexError('Project name is required')
    }

    const actor = await requireServiceActor(ctx, {
      ...args,
      minimumRole: 'member'
    })

    const projectId = await ctx.db.insert('projects', {
      organizationId: args.organizationId,
      name,
      createdByServiceActorId: actor._id,
      createdAt: Date.now()
    })

    await writeServiceAudit(ctx, {
      organizationId: args.organizationId,
      serviceActorId: actor._id,
      action: 'projects.create',
      resourceType: 'project',
      resourceId: projectId,
      result: 'allowed'
    })

    return projectId
  }
})

export const deleteWithApproval = mutation({
  args: {
    credentialHash: v.string(),
    organizationId: v.id('organizations'),
    projectId: v.id('projects'),
    approvalId: v.id('approvals')
  },
  handler: async (ctx, args) => {
    const actor = await requireServiceActor(ctx, {
      ...args,
      minimumRole: 'admin'
    })
    const project = await ctx.db.get(args.projectId)
    if (!project || project.organizationId !== args.organizationId) {
      throw new ConvexError('Project not found')
    }

    const approval = await ctx.db.get(args.approvalId)
    if (
      !approval ||
      approval.organizationId !== args.organizationId ||
      approval.operation !== 'projects.delete' ||
      approval.resourceId !== args.projectId ||
      approval.status !== 'approved' ||
      approval.expiresAt <= Date.now()
    ) {
      throw new ConvexError('Approval required')
    }

    await ctx.db.delete(args.projectId)
    await ctx.db.patch(args.approvalId, {
      status: 'used',
      usedAt: Date.now()
    })
    await writeServiceAudit(ctx, {
      organizationId: args.organizationId,
      serviceActorId: actor._id,
      action: 'projects.delete',
      resourceType: 'project',
      resourceId: args.projectId,
      result: 'allowed'
    })
  }
})

