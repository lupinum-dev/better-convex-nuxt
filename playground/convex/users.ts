import { query } from './_generated/server'

// Get the currently authenticated user from the custom users table
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      return null
    }

    // The subject is the Better Auth user ID (matches authId in users table)
    const authId = identity.subject

    // Query the custom users table using by_auth_id index
    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q) => q.eq('authId', authId))
      .first()

    return user
  },
})
