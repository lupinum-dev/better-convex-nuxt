/**
 * Why this file exists:
 * The freemium example keeps entitlements and count-based limits separate on purpose.
 */
import { v } from 'convex/values'

import { deny, guard } from 'better-convex-nuxt/auth'

import { mutation, query } from './_generated/server'
import { getActor } from './auth/actor'
import { canCreateProject, hasFeature } from './auth/checks'
import { ensureWithinLimit } from './auth/limits'

export const list = query({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    if (!actor) throw deny('Not authenticated.')

    return ctx.db
      .query('projects')
      .withIndex('by_workspace', q => q.eq('workspaceId', actor.tenantId))
      .order('desc')
      .collect()
  },
})

export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    guard(actor, 'Create project', canCreateProject)
    await ensureWithinLimit(ctx.db, actor, 'projects')

    return ctx.db.insert('projects', {
      workspaceId: actor!.tenantId,
      name: args.name,
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  },
})

export const exportProjects = query({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    guard(actor, 'Export projects', hasFeature('exports'))

    const projects = await ctx.db
      .query('projects')
      .withIndex('by_workspace', q => q.eq('workspaceId', actor!.tenantId))
      .collect()

    return projects.map(project => project.name).join(', ')
  },
})
