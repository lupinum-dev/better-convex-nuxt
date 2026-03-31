import type { GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import { getAuth } from 'better-convex-nuxt/auth'

import type { DataModel, Id } from '../_generated/dataModel'

export type Actor =
  | { kind: 'user'; userId: string; role: string; tenantId: Id<'workspaces'> }
  | null

type Ctx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>

export async function getActor(ctx: Ctx): Promise<Actor> {
  const auth = await getAuth(ctx as Parameters<typeof getAuth>[0])
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
