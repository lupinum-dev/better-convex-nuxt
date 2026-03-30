/**
 * Why this file exists:
 * The auth builder family resolves a browser identity into an application actor.
 * In this example the actor is just the signed-in user, so there is no org lookup or permission layer.
 */
import type {
  GenericMutationCtx,
  GenericQueryCtx,
} from 'convex/server'

import { defineActorConfig } from 'better-convex-nuxt/convex'

import type { DataModel } from './_generated/dataModel'

type AuthTodoCtx =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>

export default defineActorConfig<AuthTodoCtx, 'user'>({
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
      role: 'user',
    }
  },
})
