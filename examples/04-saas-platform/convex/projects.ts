import { deny, enforce } from 'better-convex-nuxt/auth'
import { withTrustedCaller, withTrustedCallerHandler } from 'better-convex-nuxt/trusted-caller'
import { v } from 'convex/values'

import { archiveProject, createProject } from '../shared/schemas/project'
import { mutation, query } from './_generated/server'
import { getActor } from './auth/actor'
import { canArchiveProject, canCreateProject, canReadProject, hasFeature } from './auth/checks'
import { ensureWithinLimit } from './auth/limits'
import { loadResource } from './auth/scope'

export const list = query({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    enforce(actor, 'Read projects', canReadProject)

    return ctx.db
      .query('projects')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', actor.tenantId))
      .order('desc')
      .collect()
  },
})

export const get = query({
  args: withTrustedCaller({ id: v.id('projects') }),
  handler: withTrustedCallerHandler(async (ctx, args) => {
    const actor = await getActor(ctx)
    enforce(actor, 'Read projects', canReadProject)

    const project = loadResource(actor, await ctx.db.get(args.id), 'Project')
    return project
  }),
})

export const create = mutation({
  args: withTrustedCaller(createProject.args),
  handler: withTrustedCallerHandler(async (ctx, args) => {
    const actor = await getActor(ctx)
    enforce(actor, 'Create project', canCreateProject)
    await ensureWithinLimit(ctx.db, actor, 'projects')

    const now = Date.now()
    const projectId = await ctx.db.insert('projects', {
      name: args.name,
      summary: args.summary,
      status: 'active',
      ownerId: actor.userId,
      workspaceId: actor.tenantId,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.insert('auditEvents', {
      workspaceId: actor.tenantId,
      actorId: actor.userId,
      entityType: 'project',
      entityId: projectId,
      action: 'project.created',
      description: `Created project "${args.name}".`,
      createdAt: now,
    })

    return projectId
  }),
})

export const archive = mutation({
  args: withTrustedCaller(archiveProject.args),
  handler: withTrustedCallerHandler(async (ctx, args) => {
    const actor = await getActor(ctx)
    enforce(actor, 'Archive project', canArchiveProject)

    const project = loadResource(actor, await ctx.db.get(args.id), 'Project')

    if (project.status === 'archived') throw deny('Project is already archived.')

    const now = Date.now()
    await ctx.db.patch(args.id, {
      status: 'archived',
      updatedAt: now,
    })

    await ctx.db.insert('auditEvents', {
      workspaceId: actor.tenantId,
      actorId: actor.userId,
      entityType: 'project',
      entityId: args.id,
      action: 'project.archived',
      description: `Archived "${project.name}".`,
      createdAt: now,
    })
  }),
})

export const exportProjects = query({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    enforce(actor, 'Export projects', hasFeature('exports'))

    const projects = await ctx.db
      .query('projects')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', actor.tenantId))
      .collect()

    return projects.map((project) => project.name).join(', ')
  },
})
