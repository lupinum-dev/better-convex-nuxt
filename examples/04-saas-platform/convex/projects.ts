import { deny, enforce, loadTenantResource as loadResource, open } from '@lupinum/trellis/auth'
import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import { archiveProject, createProject } from '../shared/schemas/project'
import {
  canArchiveProject,
  canCreateProject,
  canExportProjects,
  canReadProject,
  requireWorkspaceTenant,
} from './auth/checks'
import { ensureWithinLimit } from './auth/limits'
import { mutation, query } from './functions'

export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  guard: canReadProject,
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
  guard: canReadProject,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()

    const project = loadResource(actor, await ctx.db.get(args.id), 'Project')
    return project
  },
})

export const create = mutation({
  args: createProject.args,
  guard: canCreateProject,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    const workspaceId = requireWorkspaceTenant(actor)
    await ensureWithinLimit(ctx.db, actor, 'projects')

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
  args: archiveProject.args,
  guard: canArchiveProject,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    const workspaceId = requireWorkspaceTenant(actor)

    const project = loadResource(actor, await ctx.db.get(args.id), 'Project')

    if (project.status === 'archived') throw deny('Project is already archived.')

    const now = Date.now()
    await ctx.db.patch(args.id, {
      status: 'archived',
      updatedAt: now,
    })

    await ctx.db.insert('auditEvents', {
      workspaceId,
      actorId: actor.userId,
      entityType: 'project',
      entityId: args.id,
      action: 'project.archived',
      description: `Archived "${project.name}".`,
      createdAt: now,
    })
  },
})

export const exportProjects = query({
  args: {},
  guard: open,
  handler: async (ctx) => {
    const actor = await ctx.actor()
    enforce(actor, 'Export projects', canExportProjects)
    const workspaceId = requireWorkspaceTenant(actor)

    const projects = await ctx.db
      .query('projects')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', workspaceId))
      .collect()

    return projects.map((project) => project.name).join(', ')
  },
})
