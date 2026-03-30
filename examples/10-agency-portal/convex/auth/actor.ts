import type { GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import { getIdentity } from 'better-convex-nuxt/auth'

import type { DataModel } from '../_generated/dataModel'

export type Actor =
  | { kind: 'user'; userId: string; role: string; tenantId: string }
  | null

type Ctx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>

export async function getActor(ctx: Ctx): Promise<Actor> {
  const identity = await getIdentity(ctx)
  if (!identity) return null

  const user = await ctx.db
    .query('users')
    .withIndex('by_auth_id', q => q.eq('authId', identity.subject))
    .first()
  if (!user?.workspaceId) return null

  const membership = await ctx.db
    .query('memberships')
    .withIndex('by_user_workspace', q => q.eq('userId', user.authId).eq('workspaceId', user.workspaceId!))
    .first()
  if (!membership) return null

  return {
    kind: 'user',
    userId: user.authId,
    role: membership.role,
    tenantId: user.workspaceId,
  }
}
