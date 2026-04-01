import type { AuthIdentity } from 'better-convex-nuxt/auth'
import { getAuth, getTrustedCaller } from 'better-convex-nuxt/auth'
import type { GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import type { DataModel } from '../_generated/dataModel'

export type Actor =
  | { kind: 'user'; userId: string; role: string; tenantId: string }
  | { kind: 'service'; serviceId: string; userId: string; role: string; tenantId: string }
  | null

type TeamTodoCtx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>

export async function getActor(ctx: TeamTodoCtx, args?: unknown): Promise<Actor> {
  const trusted = getTrustedCaller(args)
  if (trusted) {
    if (!trusted.tenantId) return null
    return {
      kind: 'service',
      serviceId: 'service',
      userId: trusted.userId,
      role: trusted.role,
      tenantId: trusted.tenantId,
    }
  }

  return await resolveActor(ctx, await getAuth(ctx))
}

export async function resolveActor(ctx: TeamTodoCtx, auth: AuthIdentity | null): Promise<Actor> {
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
