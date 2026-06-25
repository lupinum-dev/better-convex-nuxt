import { ConvexError } from 'convex/values'

import type { MutationCtx, QueryCtx } from './_generated/server'
import { query } from './_generated/server'
import { getAuthenticatedSessionOrNull } from './lib/authz'

export async function getCurrentUserOrNull(ctx: QueryCtx | MutationCtx) {
  const authState = await getAuthenticatedSessionOrNull(ctx)
  if (!authState) return null

  return await ctx.db
    .query('users')
    .withIndex('by_auth_user_id', (q) => q.eq('authUserId', authState.actor.authUserId))
    .unique()
}

export async function requireCurrentUser(ctx: QueryCtx | MutationCtx) {
  const user = await getCurrentUserOrNull(ctx)
  if (!user) {
    throw new ConvexError('User projection not ready')
  }

  return user
}

export const getCurrent = query({
  args: {},
  handler: async (ctx) => {
    return await getCurrentUserOrNull(ctx)
  },
})
