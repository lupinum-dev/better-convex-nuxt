/**
 * Why this file exists:
 * The scoped builder family depends on an actor that includes both role and organization membership.
 * This resolver turns Better Auth's identity into that app-specific actor.
 */
import type {
  GenericMutationCtx,
  GenericQueryCtx,
} from 'convex/server'

import { defineActorConfig } from 'better-convex-nuxt/convex'

import type { DataModel } from './_generated/dataModel'

type TeamTodoCtx =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>

function resolveExpectedServiceKey(): string {
  return process.env.CONVEX_SERVICE_KEY?.trim() || 'example-service-key'
}

export default defineActorConfig<TeamTodoCtx, 'owner' | 'admin' | 'member' | 'viewer'>({
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
  // MCP tools use this service key when they call back into scoped Convex functions.
  serviceKey: (key: string) => key === resolveExpectedServiceKey(),
})
