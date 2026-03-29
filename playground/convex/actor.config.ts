import type { ActorConfig } from '../../src/runtime/actor'

export default {
  resolveFromAuth: async (ctx: any) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null

    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q: any) => q.eq('authId', identity.subject))
      .first()

    if (!user) return null

    return {
      _id: user._id,
      userId: user.authId,
      role: user.role,
      orgId: user.organizationId,
    }
  },

  serviceKey: 'CONVEX_SERVICE_KEY',
} satisfies ActorConfig
