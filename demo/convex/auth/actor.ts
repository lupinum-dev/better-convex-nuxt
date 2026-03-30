import type {
  GenericMutationCtx,
  GenericQueryCtx,
} from 'convex/server'

import { getIdentity } from 'better-convex-nuxt/auth'

import type { DataModel } from '../_generated/dataModel'

export type Role = 'admin' | 'member' | 'viewer'

export type Actor =
  | { kind: 'user'; userId: string; role: Role }
  | null

type DemoCtx =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>

export async function getActor(ctx: DemoCtx): Promise<Actor> {
  const identity = await getIdentity(ctx)
  if (!identity) return null

  const user = await ctx.db
    .query('users')
    .withIndex('by_auth_id', q => q.eq('authId', identity.subject))
    .first()

  if (!user) return null

  return {
    kind: 'user',
    userId: user.authId,
    role: user.role,
  }
}
