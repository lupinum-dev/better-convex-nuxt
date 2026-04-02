import { deny, enforce, requireAuth } from 'better-convex-nuxt/auth'
/**
 * Why this file exists:
 * Normal project queries stay tenant-scoped even in the agency example.
 */
import { v } from 'convex/values'

import { hasRole } from './auth/checks'
import { appMutation, appQuery } from './functions'

export const list = appQuery({
  args: {},
  handler: async (ctx) => {
    const actor = await ctx.actor()
    requireAuth(actor)

    return ctx.db
      .query('projects')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', actor.tenantId))
      .order('desc')
      .collect()
  },
})

export const create = appMutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    enforce(actor, 'Create project', hasRole('owner', 'member'))

    return ctx.db.insert('projects', {
      workspaceId: actor.tenantId,
      name: args.name,
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  },
})
