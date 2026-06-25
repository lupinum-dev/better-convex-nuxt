import { ConvexError } from 'convex/values'

import type { MutationCtx, QueryCtx } from './_generated/server'
import { mutation, query } from './_generated/server'

export async function requireCurrentUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) {
    throw new ConvexError('Unauthenticated')
  }

  const user = await ctx.db
    .query('users')
    .withIndex('by_subject', (q) => q.eq('subject', identity.subject))
    .unique()

  if (!user) {
    throw new ConvexError('User not found')
  }

  return user
}

export const upsertCurrent = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new ConvexError('Unauthenticated')
    }

    const existing = await ctx.db
      .query('users')
      .withIndex('by_subject', (q) => q.eq('subject', identity.subject))
      .unique()

    const now = Date.now()
    if (existing) {
      await ctx.db.patch(existing._id, {
        name: identity.name,
        email: identity.email,
        updatedAt: now,
      })
      return existing._id
    }

    return await ctx.db.insert('users', {
      subject: identity.subject,
      name: identity.name,
      email: identity.email,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const getCurrent = query({
  args: {},
  handler: async (ctx) => {
    return await requireCurrentUser(ctx)
  },
})
