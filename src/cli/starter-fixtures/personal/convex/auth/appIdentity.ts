import { getAuth } from '@lupinum/trellis/auth'
import type { GenericActionCtx, GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import type { DataModel, Id } from '../_generated/dataModel'

type PersonalCtx =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>
  | GenericActionCtx<DataModel>

export type AppIdentity = {
  kind: 'user'
  userId: Id<'users'>
  authKey: string
  role: string
} | null

function missingUserRowMessage(authKey: string): string {
  return [
    `Expected a Trellis users row for auth key "${authKey}", but none was found.`,
    'Verify the Trellis auth bootstrap is enabled and healthy.',
  ].join(' ')
}

export async function getAppIdentity(ctx: PersonalCtx): Promise<AppIdentity> {
  const auth = await getAuth(ctx)
  if (!auth) return null
  if (!('db' in ctx)) return null

  const user = await ctx.db
    .query('users')
    .withIndex('by_auth_key', (q) => q.eq('authKey', auth.authKey))
    .first()

  if (!user) {
    throw new Error(missingUserRowMessage(auth.authKey))
  }

  return {
    kind: 'user',
    userId: user._id,
    authKey: user.authKey,
    role: typeof user.role === 'string' ? user.role : 'member',
  }
}
