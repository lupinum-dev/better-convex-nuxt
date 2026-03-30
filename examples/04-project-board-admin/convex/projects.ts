import { mutation, query } from './_generated/server'
import { v } from 'convex/values'

import { deny, guard } from 'better-convex-nuxt/auth'

import {
  canArchiveProject,
  canCreateProject,
  canReadProject,
} from './auth/checks'
import { getActor } from './auth/actor'
import { loadResource } from './auth/scope'

export const list = query({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    guard(actor, 'Read projects', canReadProject)

    return ctx.db.query('projects')
      .withIndex('by_workspace', q => q.eq('workspaceId', actor!.tenantId))
      .order('desc')
      .collect()
  },
})

export const get = query({
  args: { id: v.id('projects') },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    guard(actor, 'Read projects', canReadProject)

    const project = loadResource(actor, await ctx.db.get(args.id), 'Project')
    return project
  },
})

export const create = mutation({
  args: {
    name: v.string(),
    summary: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    guard(actor, 'Create project', canCreateProject)

    const now = Date.now()
    const projectId = await ctx.db.insert('projects', {
      name: args.name,
      summary: args.summary,
      status: 'active',
      ownerId: actor!.userId,
      workspaceId: actor!.tenantId,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.insert('auditEvents', {
      workspaceId: actor!.tenantId,
      actorId: actor!.userId,
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
  args: { id: v.id('projects') },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    guard(actor, 'Archive project', canArchiveProject)

    const project = loadResource(actor, await ctx.db.get(args.id), 'Project')

    if (project.status === 'archived') throw deny('Project is already archived.')

    const now = Date.now()
    await ctx.db.patch(args.id, {
      status: 'archived',
      updatedAt: now,
    })

    await ctx.db.insert('auditEvents', {
      workspaceId: actor!.tenantId,
      actorId: actor!.userId,
      entityType: 'project',
      entityId: args.id,
      action: 'project.archived',
      description: `Archived "${project.name}".`,
      createdAt: now,
    })
  },
})
