import { loadTenantResource as loadResource } from '@lupinum/trellis/auth'
import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import { createProject } from '../../../shared/features/projects/contract'
import { requireWorkspaceTenant } from '../../auth/guards'
import { mutation, query } from '../../functions'
import { archiveProjectOp } from './operations'
import { projectCreate, projectExport, projectRead } from './permissions'

export const list = query.protected({
  args: { paginationOpts: paginationOptsValidator },
  guard: projectRead,
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const workspaceId = requireWorkspaceTenant(appIdentity)

    return ctx.db
      .query('projects')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', workspaceId))
      .order('desc')
      .paginate(args.paginationOpts)
  },
})

export const get = query.protected({
  args: { id: v.id('projects') },
  guard: projectRead,
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    return loadResource(appIdentity, await ctx.db.get(args.id), 'Project')
  },
})

export const create = mutation.protected({
  args: createProject.args,
  guard: projectCreate,
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const workspaceId = requireWorkspaceTenant(appIdentity)

    const now = Date.now()
    const projectId = await ctx.db.insert('projects', {
      name: args.name,
      summary: args.summary,
      status: 'active',
      ownerId: appIdentity.userId,
      workspaceId,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.insert('auditEvents', {
      workspaceId,
      actorId: appIdentity.userId,
      entityType: 'project',
      entityId: projectId,
      action: 'project.created',
      description: `Created project "${args.name}".`,
      createdAt: now,
    })

    return projectId
  },
})

export const archive = mutation.protected({
  ...archiveProjectOp,
})

export const exportProjects = query.protected({
  args: {},
  guard: projectExport,
  handler: async (ctx) => {
    const appIdentity = await ctx.appIdentity()
    const workspaceId = requireWorkspaceTenant(appIdentity)

    const projects = await ctx.db
      .query('projects')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', workspaceId))
      .collect()

    return projects.map((project) => project.name).join(', ')
  },
})
