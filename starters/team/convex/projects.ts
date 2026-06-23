import { paginationOptsValidator } from 'convex/server'
import { ConvexError, v } from 'convex/values'

import { mutation, query } from './_generated/server'
import { writeAuditEvent } from './lib/audit'
import { requireProjectAccessById, requireProjectTeamAccess } from './lib/authz'
import { projectStatus } from './schema'

export const list = query({
  args: {
    teamId: v.string(),
    status: projectStatus,
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const access = await requireProjectTeamAccess(ctx, {
      teamId: args.teamId,
      permission: 'read',
    })

    return await ctx.db
      .query('projects')
      .withIndex('by_organizationId_teamId_status_updatedAt', (q) =>
        q
          .eq('organizationId', access.organizationId)
          .eq('teamId', args.teamId)
          .eq('status', args.status),
      )
      .order('desc')
      .paginate(args.paginationOpts)
  },
})

export const create = mutation({
  args: {
    teamId: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim()
    if (!name) {
      throw new ConvexError('Project name is required')
    }

    const access = await requireProjectTeamAccess(ctx, {
      teamId: args.teamId,
      permission: 'create',
    })
    const now = Date.now()

    const projectId = await ctx.db.insert('projects', {
      organizationId: access.organizationId,
      teamId: access.teamId,
      name,
      status: 'active',
      createdByAuthUserId: access.actor.authUserId,
      createdAt: now,
      updatedAt: now,
    })

    await writeAuditEvent(ctx, {
      organizationId: access.organizationId,
      teamId: access.teamId,
      actor: access.actor,
      action: 'project.create',
      resourceType: 'project',
      resourceId: projectId,
      summary: `Created project ${name}`,
      createdAt: now,
    })

    return projectId
  },
})

export const rename = mutation({
  args: {
    projectId: v.id('projects'),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim()
    if (!name) {
      throw new ConvexError('Project name is required')
    }

    const access = await requireProjectAccessById(ctx, {
      projectId: args.projectId,
      permission: 'update',
    })
    if (access.project.status !== 'active') {
      throw new ConvexError('Deleted projects must be restored before renaming')
    }

    const now = Date.now()
    const previousName = access.project.name

    await ctx.db.patch(args.projectId, {
      name,
      updatedAt: now,
    })

    await writeAuditEvent(ctx, {
      organizationId: access.organizationId,
      teamId: access.teamId,
      actor: access.actor,
      action: 'project.update',
      resourceType: 'project',
      resourceId: args.projectId,
      summary: `Renamed project from ${previousName} to ${name}`,
      createdAt: now,
    })

    return args.projectId
  },
})

export const softDelete = mutation({
  args: {
    projectId: v.id('projects'),
  },
  handler: async (ctx, args) => {
    const access = await requireProjectAccessById(ctx, {
      projectId: args.projectId,
      permission: 'delete',
    })
    const now = Date.now()

    if (access.project.status === 'deleted') {
      return args.projectId
    }

    await ctx.db.patch(args.projectId, {
      status: 'deleted',
      updatedAt: now,
      deletedAt: now,
      deletedByAuthUserId: access.actor.authUserId,
    })

    await writeAuditEvent(ctx, {
      organizationId: access.organizationId,
      teamId: access.teamId,
      actor: access.actor,
      action: 'project.delete',
      resourceType: 'project',
      resourceId: args.projectId,
      summary: `Deleted project ${access.project.name}`,
      createdAt: now,
    })

    return args.projectId
  },
})

export const restore = mutation({
  args: {
    projectId: v.id('projects'),
  },
  handler: async (ctx, args) => {
    const access = await requireProjectAccessById(ctx, {
      projectId: args.projectId,
      permission: 'delete',
    })
    const now = Date.now()

    if (access.project.status === 'active') {
      return args.projectId
    }

    await ctx.db.patch(args.projectId, {
      status: 'active',
      updatedAt: now,
      deletedAt: undefined,
      deletedByAuthUserId: undefined,
    })

    await writeAuditEvent(ctx, {
      organizationId: access.organizationId,
      teamId: access.teamId,
      actor: access.actor,
      action: 'project.restore',
      resourceType: 'project',
      resourceId: args.projectId,
      summary: `Restored project ${access.project.name}`,
      createdAt: now,
    })

    return args.projectId
  },
})
