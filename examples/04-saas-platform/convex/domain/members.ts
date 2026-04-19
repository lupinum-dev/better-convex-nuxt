import { deny, enforce, ensureTenant, requireRecord } from '@lupinum/trellis/auth'
import { v } from 'convex/values'

import { requireWorkspaceTenant } from '../auth/checks'
import { workspaceMembers } from '../auth/permissions'
import { mutation, query } from '../functions'

export const list = query({
  args: {},
  guard: workspaceMembers,
  handler: async (ctx) => {
    const actor = await ctx.actor()
    const workspaceId = requireWorkspaceTenant(actor)

    const users = await ctx.db.query('users').order('asc').collect()
    return users.filter((user) => user.workspaceId === workspaceId)
  },
})

export const changeRole = mutation({
  args: {
    userId: v.id('users'),
    newRole: v.union(v.literal('admin'), v.literal('member'), v.literal('viewer')),
  },
  guard: workspaceMembers,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    const workspaceId = requireWorkspaceTenant(actor)

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
      workspaceId,
      actorId: actor.userId,
      entityType: 'user',
      entityId: target.authId,
      action: 'workspace.role_changed',
      description: `Changed ${target.displayName ?? target.authId} to ${args.newRole}.`,
      createdAt: now,
    })
  },
})
