/**
 * Why this file exists:
 * Normal project queries stay tenant-scoped even in the agency example.
 */
import { v } from 'convex/values'

import { deny, authorize, requireAuth } from 'better-convex-nuxt/auth'

import { mutation, query } from './_generated/server'
import { getActor } from './auth/actor'
import { hasRole } from './auth/checks'

export const list = query({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    requireAuth(actor)

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
    authorize(actor, 'Create project', hasRole('owner', 'member'))

    return ctx.db.insert('projects', {
      workspaceId: actor.tenantId,
      name: args.name,
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  },
})
