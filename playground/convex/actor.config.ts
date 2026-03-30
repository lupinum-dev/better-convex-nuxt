import type {
  GenericMutationCtx,
  GenericQueryCtx,
} from 'convex/server'

import { defineActorConfig } from '../../src/runtime/convex'
import type { DataModel } from './_generated/dataModel'
import { PLAYGROUND_LOCAL_SERVICE_KEY } from '../shared/dev-service-key'

type PlaygroundActorCtx =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>

function resolveExpectedServiceKey(): string {
  return process.env.CONVEX_SERVICE_KEY?.trim() || PLAYGROUND_LOCAL_SERVICE_KEY
}

export const actorConfig = defineActorConfig<PlaygroundActorCtx>({
  resolveFromAuth: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null

    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', q => q.eq('authId', identity.subject))
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
})

export default actorConfig
