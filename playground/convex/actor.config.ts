import type { ActorConfig } from '../../src/runtime/actor'
import { PLAYGROUND_LOCAL_SERVICE_KEY } from '../shared/dev-service-key'

function resolveExpectedServiceKey(): string {
  return process.env.CONVEX_SERVICE_KEY?.trim() || PLAYGROUND_LOCAL_SERVICE_KEY
}

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

  serviceKey: (key: string) => key === resolveExpectedServiceKey(),
} satisfies ActorConfig
