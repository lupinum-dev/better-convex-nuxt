import type {
  GenericMutationCtx,
  GenericQueryCtx,
} from 'convex/server'

import type { AuthIdentity } from 'better-convex-nuxt/auth'
import { getAuth, getTrustedCaller } from 'better-convex-nuxt/auth'

import type { DataModel } from '../_generated/dataModel'

export type Role = 'owner' | 'admin' | 'member' | 'viewer'

export type Actor =
  | { kind: 'user'; userId: string; role: Role; tenantId?: string }
  | null

type PlaygroundCtx =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>

export async function getActor(ctx: PlaygroundCtx, args?: unknown): Promise<Actor> {
  const trusted = getTrustedCaller(args)
  if (trusted) {
    if (
      trusted.role === 'owner'
      || trusted.role === 'admin'
      || trusted.role === 'member'
      || trusted.role === 'viewer'
    ) {
      return {
        kind: 'user',
        userId: trusted.userId,
        role: trusted.role,
        ...(trusted.tenantId ? { tenantId: trusted.tenantId } : {}),
      }
    }

    return null
  }

  return await resolveActor(ctx, await getAuth(ctx))
}

export async function resolveActor(
  ctx: PlaygroundCtx,
  auth: AuthIdentity | null,
): Promise<Actor> {
  if (!auth) return null

  const user = await ctx.db
    .query('users')
    .withIndex('by_auth_id', q => q.eq('authId', auth.subject))
    .first()

  if (!user) return null

  return {
    kind: 'user',
    userId: user.authId,
    role: user.role,
    ...(user.organizationId ? { tenantId: user.organizationId } : {}),
  }
}
