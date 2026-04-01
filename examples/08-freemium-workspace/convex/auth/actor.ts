import { getAuth } from 'better-convex-nuxt/auth'
/**
 * Why this file differs from the default tenant-scoped pattern:
 * The freemium example resolves both tenant membership and plan state into the actor so backend
 * plan checks stay alongside role checks. `userId` remains the auth-subject string.
 */
import type { GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import type { DataModel, Doc, Id } from '../_generated/dataModel'

export type Actor = {
  kind: 'user'
  userId: string
  role: Doc<'users'>['role']
  tenantId: Id<'workspaces'>
  plan: Doc<'workspaces'>['plan']
} | null

type Ctx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>

export async function getActor(ctx: Ctx): Promise<Actor> {
  const auth = await getAuth(ctx)
  if (!auth) return null

  const user = await ctx.db
    .query('users')
    .withIndex('by_auth_id', (q) => q.eq('authId', auth.subject))
    .first()

  if (!user?.workspaceId) return null

  const workspace = await ctx.db.get(user.workspaceId)
  if (!workspace) return null

  return {
    kind: 'user',
    userId: user.authId,
    role: user.role,
    tenantId: user.workspaceId,
    plan: workspace.plan,
  }
}
