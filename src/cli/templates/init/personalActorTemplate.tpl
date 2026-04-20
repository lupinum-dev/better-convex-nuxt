import { getAuth, type DefaultActor } from '@lupinum/trellis/auth'
import type { GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import type { DataModel } from '../_generated/dataModel'

type PersonalCtx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>

export type Actor = DefaultActor | null

function missingUserRowMessage(authId: string): string {
  return [
    `Expected a Trellis users row for auth subject "${authId}", but none was found.`,
    'Ensure convex/auth.ts exports onCreate, onUpdate, and onDelete from authComponent.triggersApi().',
    'If the auth wiring is already correct, ensure auth:createUserIfNeeded has run for this user.',
  ].join(' ')
}

export async function getActor(ctx: PersonalCtx): Promise<Actor> {
  const auth = await getAuth(ctx)
  if (!auth) return null

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
    ...(user.workspaceId ? { tenantId: String(user.workspaceId) } : {}),
  }
}
