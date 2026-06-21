import { ConvexError } from 'convex/values'

import type { MutationCtx, QueryCtx } from './_generated/server'
import { mutation, query } from './_generated/server'

export async function getCurrentUserOrNull(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) {
    return null
  }

  return await ctx.db
    .query('users')
    .withIndex('by_subject', (q) => q.eq('subject', identity.subject))
    .unique()
}

export async function requireCurrentUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) {
    throw new ConvexError('Unauthenticated')
  }

  const user = await getCurrentUserOrNull(ctx)
  if (!user) {
    throw new ConvexError('User not found')
  }

  return user
}

export async function ensureCurrentUser(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) {
    throw new ConvexError('Unauthenticated')
  }

  const existing = await getCurrentUserOrNull(ctx)
  const now = Date.now()

  if (existing) {
    await ctx.db.patch(existing._id, {
      name: identity.name,
      email: identity.email,
      updatedAt: now
    })
    return { ...existing, name: identity.name, email: identity.email, updatedAt: now }
  }

  const userId = await ctx.db.insert('users', {
    subject: identity.subject,
    name: identity.name,
    email: identity.email,
    createdAt: now,
    updatedAt: now
  })

  const user = await ctx.db.get(userId)
  if (!user) {
    throw new ConvexError('User was not created')
  }

  return user
}

export const getCurrent = query({
  args: {},
  handler: async (ctx) => {
    return await getCurrentUserOrNull(ctx)
  }
})

export const upsertCurrent = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await ensureCurrentUser(ctx)
    return user._id
  }
})
