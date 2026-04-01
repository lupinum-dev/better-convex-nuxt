import { getAuth } from 'better-convex-nuxt/auth'
/**
 * Why this file differs from the default tenant-scoped pattern:
 * LMS access stays on the single-workspace track, but lesson progress and enrollment still use the
 * auth-subject string stored in the user row rather than a Convex user document id.
 */
import type { GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import type { DataModel, Doc, Id } from '../_generated/dataModel'

export type Actor = {
  kind: 'user'
  userId: string
  role: Doc<'users'>['role']
  tenantId: Id<'workspaces'>
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

  return {
    kind: 'user',
    userId: user.authId,
    role: user.role,
    tenantId: user.workspaceId,
  }
}
