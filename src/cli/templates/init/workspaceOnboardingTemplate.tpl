import { getAuth } from '@lupinum/trellis/auth'
import { v } from 'convex/values'

import { raw } from '../functions'

export const createFirstWorkspace = raw.mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const auth = await getAuth(ctx)
    if (!auth) {
      throw new Error('Not authenticated.')
    }

    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q) => q.eq('authId', auth.subject))
      .first()

    if (!user) {
      throw new Error(
        [
          `Expected a Trellis users row for auth subject "${auth.subject}", but none was found.`,
          'Ensure convex/auth.ts exports onCreate, onUpdate, and onDelete from authComponent.triggersApi().',
          'If the auth wiring is already correct, ensure auth:createUserIfNeeded has run for this user.',
        ].join(' '),
      )
    }

    if (user.workspaceId) {
      return user.workspaceId
    }

    const now = Date.now()
    const workspaceId = await ctx.db.insert('workspaces', {
      name: args.name,
      createdAt: now,
    })

    await ctx.db.patch(user._id, {
      workspaceId,
      role: 'owner',
      updatedAt: now,
    })

    return workspaceId
  },
})
