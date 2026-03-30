import type {
  GenericMutationCtx,
  GenericQueryCtx,
} from 'convex/server'

import { getIdentity, verifyKey } from 'better-convex-nuxt/auth'

import type { DataModel } from '../_generated/dataModel'
import { PLAYGROUND_LOCAL_SERVICE_KEY } from '../../shared/dev-service-key'

export type Role = 'owner' | 'admin' | 'member' | 'viewer'

export type Actor =
  | { kind: 'user'; userId: string; role: Role; tenantId?: string }
  | { kind: 'service'; serviceId: string; role: Role; tenantId?: string }
  | null

type PlaygroundCtx =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>

function resolveExpectedServiceKey(): string {
  return process.env.CONVEX_SERVICE_KEY?.trim() || PLAYGROUND_LOCAL_SERVICE_KEY
}

export async function getActor(ctx: PlaygroundCtx): Promise<Actor> {
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
    ...(user.organizationId ? { tenantId: user.organizationId } : {}),
  }
}

export function getServiceActor(
  key: string,
  actor: { serviceId: string; role: Role; tenantId?: string },
): Actor {
  if (!verifyKey(key, resolveExpectedServiceKey())) return null
  return { kind: 'service', ...actor }
}
