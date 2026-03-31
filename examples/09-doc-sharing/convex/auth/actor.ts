import type { GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import { getAuth } from 'better-convex-nuxt/auth'

import type { DataModel } from '../_generated/dataModel'

export type Actor =
  | { kind: 'user'; userId: string; role: string; tenantId: string }
  | null

type Ctx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>

export async function getActor(ctx: Ctx): Promise<Actor> {
  const auth = await getAuth(ctx)
  if (!auth) return null

  const user = await ctx.db
    .query('users')
    .withIndex('by_auth_id', q => q.eq('authId', auth.subject))
    .first()

  if (!user?.workspaceId) return null

  return {
    kind: 'user',
    userId: user.authId,
    role: user.role,
    tenantId: user.workspaceId,
  }
}
