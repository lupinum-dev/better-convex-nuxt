import type { AuthIdentity } from 'better-convex-nuxt/auth'
import { getAuth } from 'better-convex-nuxt/auth'
import { getTrustedCaller } from 'better-convex-nuxt/trusted-caller'
import type { GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import type { DataModel } from '../_generated/dataModel'

export type Role = 'owner' | 'admin' | 'member' | 'viewer'

export type Actor = { kind: 'user'; userId: string; role: Role; tenantId?: string } | null

type PlaygroundCtx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>

export async function getActor(ctx: PlaygroundCtx): Promise<Actor> {
  const trusted = getTrustedCaller(ctx)
  if (trusted) {
    return await resolveActor(ctx, { subject: trusted.userId })
  }

  return await resolveActor(ctx, await getAuth(ctx))
}

export async function resolveActor(ctx: PlaygroundCtx, auth: AuthIdentity | null): Promise<Actor> {
  if (!auth) return null

  const user = await ctx.db
    .query('users')
    .withIndex('by_auth_id', (q) => q.eq('authId', auth.subject))
    .first()

  if (!user) return null

  return {
    kind: 'user',
    userId: user.authId,
    role: user.role,
    ...(user.organizationId ? { tenantId: user.organizationId } : {}),
  }
}
