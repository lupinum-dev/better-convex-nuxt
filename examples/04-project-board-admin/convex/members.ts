/**
 * Why this file exists:
 * Member management is the clearest way to prove that frontend permissions react live when roles
 * change in the database. The query stays tiny because the scoped builder already narrowed the data.
 */
import { v } from 'convex/values'

import {
  scopedMutation,
  scopedQuery,
} from './functions'

const editableRole = v.union(v.literal('admin'), v.literal('member'), v.literal('viewer'))

export const list = scopedQuery({
  args: {},
  require: 'workspace.members',
  handler: async ({ db }) => {
    return await db.query('users').order('asc').collect()
  },
})

export const changeRole = scopedMutation({
  args: {
    userId: v.id('users'),
    newRole: editableRole,
  },
  require: 'workspace.members',
  handler: async ({ db, actor }, args) => {
    const target = await db.get(args.userId)
    if (!target) {
      throw new Error('User not found.')
    }
    if (target.role === 'owner') {
      throw new Error('Cannot change the owner role.')
    }
    if (args.newRole === 'admin' && actor.role !== 'owner') {
      throw new Error('Only the owner can promote another admin.')
    }

    const now = Date.now()
    await db.patch(args.userId, {
      role: args.newRole,
      updatedAt: now,
    })

    await db.insert('auditEvents', {
      actorId: actor.userId,
      entityType: 'user',
      entityId: target.authId,
      action: 'workspace.role_changed',
      description: `Changed ${target.displayName ?? target.authId} to ${args.newRole}.`,
      createdAt: now,
    })
  },
})
