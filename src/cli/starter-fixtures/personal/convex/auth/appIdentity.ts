import { getAuth, type DefaultAppIdentity } from '@lupinum/trellis/auth'
import type { GenericActionCtx, GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import type { DataModel } from '../_generated/dataModel'

type PersonalCtx =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>
  | GenericActionCtx<DataModel>

export type AppIdentity = DefaultAppIdentity | null

function missingUserRowMessage(authId: string): string {
  return [
    `Expected a Trellis users row for auth subject "${authId}", but none was found.`,
    'Ensure convex/auth.ts exports onCreate, onUpdate, and onDelete from authComponent.triggersApi().',
    'If those exports are already correct, verify the Trellis auth bootstrap is enabled and healthy.',
  ].join(' ')
}

export async function getAppIdentity(ctx: PersonalCtx): Promise<AppIdentity> {
  const auth = await getAuth(ctx)
  if (!auth) return null
  if (!('db' in ctx)) return null

  const user = await ctx.db
    .query('users')
    .withIndex('by_auth_id', (q) => q.eq('authId', auth.subject))
    .first()

  if (!user) {
    throw new Error(missingUserRowMessage(auth.subject))
  }

  return {
    kind: 'user',
    userId: user.authId,
    role: typeof user.role === 'string' ? user.role : 'member',
  }
}
