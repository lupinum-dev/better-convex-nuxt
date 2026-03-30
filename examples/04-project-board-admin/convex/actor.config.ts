/**
 * Why this file exists:
 * Scoped builders need an actor with both role and workspace membership.
 * This resolver turns Better Auth's identity into that app-specific actor shape.
 */
import type {
  GenericMutationCtx,
  GenericQueryCtx,
} from 'convex/server'

import { defineActorConfig } from 'better-convex-nuxt/convex'

import type { DataModel } from './_generated/dataModel'

type ProjectBoardCtx =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>

function resolveExpectedServiceKey(): string {
  return process.env.CONVEX_SERVICE_KEY?.trim() || 'example-service-key'
}

export default defineActorConfig({
  resolveFromAuth: async (ctx: ProjectBoardCtx) => {
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
      tenantId: user.workspaceId,
    }
  },
  serviceKey: (key: string) => key === resolveExpectedServiceKey(),
})
