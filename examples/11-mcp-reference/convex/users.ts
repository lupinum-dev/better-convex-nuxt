import { query } from './_generated/server'

import { getActor } from './auth/actor'

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    if (!actor) return null

    return await ctx.db
      .query('users')
      .withIndex('by_auth_id', q => q.eq('authId', actor.userId))
      .first()
  },
})
