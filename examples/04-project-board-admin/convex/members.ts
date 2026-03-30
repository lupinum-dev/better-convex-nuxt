import { query, mutation } from './_generated/server'
import { v } from 'convex/values'

import { deny, guard } from 'better-convex-nuxt/auth'

import { canManageMembers } from './auth/checks'
import { getActor } from './auth/actor'
import { ensureFound, ensureTenant } from './auth/scope'

export const list = query({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    guard(actor, 'Manage members', canManageMembers)

    return ctx.db.query('users')
      .withIndex('by_workspace', q => q.eq('workspaceId', actor!.tenantId))
      .order('asc')
      .collect()
  },
})

export const changeRole = mutation({
  args: {
    userId: v.id('users'),
    newRole: v.union(v.literal('admin'), v.literal('member'), v.literal('viewer')),
  },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    guard(actor, 'Manage members', canManageMembers)

    const target = await ctx.db.get(args.userId)
    ensureFound(target, 'User')
    ensureTenant(actor, { workspaceId: target.workspaceId })

    if (target.role === 'owner') throw deny('Cannot change the owner role.')
    if (args.newRole === 'admin' && actor!.role !== 'owner') {
      throw deny('Only the owner can promote to admin.')
    }

    const now = Date.now()
    await ctx.db.patch(args.userId, { role: args.newRole, updatedAt: now })
    await ctx.db.insert('auditEvents', {
      workspaceId: actor!.tenantId,
      actorId: actor!.userId,
      entityType: 'user',
      entityId: target.authId,
      action: 'workspace.role_changed',
      description: `Changed ${target.displayName ?? target.authId} to ${args.newRole}.`,
      createdAt: now,
    })
  },
})
