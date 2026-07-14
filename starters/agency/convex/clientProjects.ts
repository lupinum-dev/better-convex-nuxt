import { ConvexError, v } from 'convex/values'

import { mutation, query } from './_generated/server'
import { requireDelegatedClientAccess, requireOrganizationKind, requireOrgMember } from './access'
import { writeAuditEvent } from './audit'

export const listForClient = query({
  args: {
    clientOrganizationId: v.id('organizations'),
    agencyOrganizationId: v.optional(v.id('organizations')),
  },
  handler: async (ctx, args) => {
    if (args.agencyOrganizationId) {
      await requireDelegatedClientAccess(ctx, {
        agencyOrganizationId: args.agencyOrganizationId,
        clientOrganizationId: args.clientOrganizationId,
      })
    } else {
      await requireOrganizationKind(ctx, args.clientOrganizationId, 'client')
      await requireOrgMember(ctx, args.clientOrganizationId)
    }

    const projects = await ctx.db
      .query('clientProjects')
      .withIndex('by_client', (q) => q.eq('clientOrganizationId', args.clientOrganizationId))
      .order('desc')
      .take(100)
    return projects.map((project) => ({
      id: project._id,
      name: project.name,
      createdAt: project.createdAt,
    }))
  },
})

export const createForClient = mutation({
  args: {
    agencyOrganizationId: v.id('organizations'),
    clientOrganizationId: v.id('organizations'),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim()
    if (!name || name.length > 160) {
      throw new ConvexError('Project name must be between 1 and 160 characters')
    }

    const access = await requireDelegatedClientAccess(ctx, args, 'member')
    const projectId = await ctx.db.insert('clientProjects', {
      clientOrganizationId: args.clientOrganizationId,
      name,
      createdBy: access.user._id,
      actingFromOrganizationId: args.agencyOrganizationId,
      createdAt: Date.now(),
    })

    await writeAuditEvent(ctx, {
      organizationId: args.clientOrganizationId,
      actorUserId: access.user._id,
      accessPath: 'delegated',
      action: 'clientProjects.create',
      resourceType: 'clientProject',
      resourceId: projectId,
    })

    return projectId
  },
})
