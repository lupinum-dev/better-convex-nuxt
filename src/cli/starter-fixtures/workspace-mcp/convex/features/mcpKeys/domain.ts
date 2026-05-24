import { v } from 'convex/values'

import { mutation, query } from '../../functions'

const TOUCH_DEBOUNCE_MS = 60_000

export const validate = query.public({
  args: {
    hash: v.string(),
  },
  handler: async (ctx, args) => {
    const key = await ctx.db
      .query('mcpKeys')
      .withIndex('by_hash', (q) => q.eq('hash', args.hash))
      .first()

    if (!key || key.status !== 'active') return null
    const boundUser = await ctx.db.get(key.boundUserId)

    if (!boundUser?.workspaceId || boundUser.workspaceId !== key.boundWorkspaceId) return null
    if (!boundUser.role) return null

    return {
      id: key._id,
      role: boundUser.role,
      userId: boundUser._id,
      workspaceId: boundUser.workspaceId,
      lastUsedAt: key.lastUsedAt ?? null,
    }
  },
})

export const touch = mutation.public({
  args: {
    hash: v.string(),
  },
  handler: async (ctx, args) => {
    const key = await ctx.db
      .query('mcpKeys')
      .withIndex('by_hash', (q) => q.eq('hash', args.hash))
      .first()
    if (!key || key.status !== 'active') return

    const now = Date.now()
    const lastUsedAt = typeof key.lastUsedAt === 'number' ? key.lastUsedAt : 0
    if (now - lastUsedAt < TOUCH_DEBOUNCE_MS) return

    await ctx.db.patch(key._id, {
      lastUsedAt: now,
    })
  },
})
