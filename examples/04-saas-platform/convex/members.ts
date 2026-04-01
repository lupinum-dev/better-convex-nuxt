import { deny, enforce, ensureTenant } from 'better-convex-nuxt/auth'
import { withTrustedCaller, withTrustedCallerHandler } from 'better-convex-nuxt/trusted-caller'
import { v } from 'convex/values'

import { query, mutation } from './_generated/server'
import { getActor } from './auth/actor'
import { canManageMembers } from './auth/checks'
import { requireRecord } from './auth/scope'

export const list = query({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    enforce(actor, 'Manage members', canManageMembers)

    return ctx.db
      .query('users')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', actor.tenantId))
      .order('asc')
      .collect()
  },
})

export const changeRole = mutation({
  args: withTrustedCaller({
    userId: v.id('users'),
    newRole: v.union(v.literal('admin'), v.literal('member'), v.literal('viewer')),
  }),
  handler: withTrustedCallerHandler(async (ctx, args) => {
    const actor = await getActor(ctx)
    enforce(actor, 'Manage members', canManageMembers)

    const target = await ctx.db.get(args.userId)
    requireRecord(target, 'User')
    // Users can exist before they join a workspace, so this edge stays explicit instead of
    // forcing the generic loadResource() helper onto an optional workspaceId shape.
    ensureTenant(actor, { workspaceId: target.workspaceId })

    if (target.role === 'owner') throw deny('Cannot change the owner role.')
    if (args.newRole === 'admin' && actor.role !== 'owner') {
      throw deny('Only the owner can promote to admin.')
    }

    const now = Date.now()
    await ctx.db.patch(args.userId, { role: args.newRole, updatedAt: now })
    await ctx.db.insert('auditEvents', {
      workspaceId: actor.tenantId,
      actorId: actor.userId,
      entityType: 'user',
      entityId: target.authId,
      action: 'workspace.role_changed',
      description: `Changed ${target.displayName ?? target.authId} to ${args.newRole}.`,
      createdAt: now,
    })
  }),
})
