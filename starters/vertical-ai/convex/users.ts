import { ConvexError } from 'convex/values'

import type { MutationCtx, QueryCtx } from './_generated/server'

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

