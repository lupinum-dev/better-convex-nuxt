import { getAuth } from 'better-convex-nuxt/auth'
/**
 * Why this file differs from the later tenant-scoped examples:
 * Example 02 is still auth-only. `userId` here is the auth-subject string stored in `users.authId`,
 * not a Convex document id.
 */
import type { GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import type { DataModel } from '../_generated/dataModel'

export type Actor = { kind: 'user'; userId: string } | null

type AuthTodoCtx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>

export async function getActor(ctx: AuthTodoCtx): Promise<Actor> {
  const auth = await getAuth(ctx)
  if (!auth) return null

  const user = await ctx.db
    .query('users')
    .withIndex('by_auth_id', (q) => q.eq('authId', auth.subject))
    .first()

  if (!user) return null

  return {
    kind: 'user',
    userId: user.authId,
  }
}
