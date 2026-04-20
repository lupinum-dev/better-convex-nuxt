import { loadTenantResource as loadResource } from '@lupinum/trellis/auth'
import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import { createProject } from '../../../shared/features/projects/contract'
import { requireWorkspaceTenant } from '../../auth/guards'
import { mutation, query } from '../../functions'
import { archiveProjectOp } from './operations'
import { projectCreate, projectExport, projectRead } from './permissions'

export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  guard: projectRead,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    const workspaceId = requireWorkspaceTenant(actor)

    return ctx.db
      .query('projects')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', workspaceId))
      .order('desc')
      .paginate(args.paginationOpts)
  },
})

export const get = query({
  args: { id: v.id('projects') },
  guard: projectRead,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    return loadResource(actor, await ctx.db.get(args.id), 'Project')
  },
})

export const create = mutation({
  args: createProject.args,
  guard: projectCreate,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    const workspaceId = requireWorkspaceTenant(actor)

    const now = Date.now()
    const projectId = await ctx.db.insert('projects', {
      name: args.name,
      summary: args.summary,
      status: 'active',
      ownerId: actor.userId,
      workspaceId,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.insert('auditEvents', {
      workspaceId,
      actorId: actor.userId,
      entityType: 'project',
      entityId: projectId,
      action: 'project.created',
      description: `Created project "${args.name}".`,
      createdAt: now,
    })

    return projectId
  },
})

export const archive = mutation({
  ...archiveProjectOp,
})

export const exportProjects = query({
  args: {},
  guard: projectExport,
  handler: async (ctx) => {
    const actor = await ctx.actor()
    const workspaceId = requireWorkspaceTenant(actor)

    const projects = await ctx.db
      .query('projects')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', workspaceId))
      .collect()

    return projects.map((project) => project.name).join(', ')
  },
})
