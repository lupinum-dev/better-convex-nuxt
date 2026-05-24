import { getAuth } from '@lupinum/trellis/auth'
/**
 * Why this file differs from the later tenant-scoped examples:
 * Example 02 is still auth-only. It still resolves app identity through the local `users` table so
 * todo rows never store provider subjects or auth keys as user ids.
 */
import type { GenericActionCtx, GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import type { DataModel, Id } from '../_generated/dataModel'

export type AppIdentity = { kind: 'user'; userId: Id<'users'>; authKey: string } | null

type AuthTodoCtx =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>
  | GenericActionCtx<DataModel>

export async function getAppIdentity(ctx: AuthTodoCtx): Promise<AppIdentity> {
  const auth = await getAuth(ctx)
  if (!auth) return null
  if (!('db' in ctx)) {
    throw new Error('AuthTodo appIdentity resolution requires a query or mutation context.')
  }

  const user = await ctx.db
    .query('users')
    .withIndex('by_auth_key', (q: any) => q.eq('authKey', auth.authKey))
    .first()

  if (!user) return null

  return {
    kind: 'user',
    userId: user._id,
    authKey: user.authKey,
  }
}
