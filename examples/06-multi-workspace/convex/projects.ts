import { deny, enforce, requireAuth } from '@lupinum/trellis/auth'
/**
 * Why this file exists:
 * Normal project queries stay tenant-scoped even in the agency example.
 */
import { v } from 'convex/values'

import { hasRole } from './auth/checks'
import { app } from './functions'

export const list = app.query({
  args: {},
  guard: hasRole('owner', 'member', 'viewer', 'agency_admin', 'agency_manager'),
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

export const create = app.mutation({
  args: { name: v.string() },
  guard: hasRole('owner', 'member'),
  handler: async (ctx, args) => {
    const actor = await ctx.actor()

    return ctx.db.insert('projects', {
      workspaceId: actor.tenantId,
      name: args.name,
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  },
})
