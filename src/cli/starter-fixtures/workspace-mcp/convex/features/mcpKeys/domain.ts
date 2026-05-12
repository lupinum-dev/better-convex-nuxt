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

    return {
      id: key._id,
      role: key.boundRole,
      userId: key.boundAuthId,
      tenantId: key.boundWorkspaceId,
      lastUsedAt: key.lastUsedAt ?? null,
    }
  },
})

export const touch = mutation.public({
  args: {
    hash: v.string(),
    seenAt: v.number(),
  },
  handler: async (ctx, args) => {
    const key = await ctx.db
      .query('mcpKeys')
      .withIndex('by_hash', (q) => q.eq('hash', args.hash))
      .first()
    if (!key || key.status !== 'active') return

    const lastUsedAt = typeof key.lastUsedAt === 'number' ? key.lastUsedAt : 0
    if (args.seenAt - lastUsedAt < TOUCH_DEBOUNCE_MS) return

    await ctx.db.patch(key._id, {
      lastUsedAt: args.seenAt,
    })
  },
})
