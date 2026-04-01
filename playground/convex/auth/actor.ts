import type {
  GenericMutationCtx,
  GenericQueryCtx,
} from 'convex/server'

import { getAuth, verifyKey } from 'better-convex-nuxt/auth'

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

type ServiceAuthArgs = {
  _serviceKey?: string
  _serviceActor?: {
    userId?: string
    role?: string
    tenantId?: string
  }
}

function resolveExpectedServiceKey(): string {
  return process.env.CONVEX_SERVICE_KEY?.trim() || PLAYGROUND_LOCAL_SERVICE_KEY
}

export async function getActor(ctx: PlaygroundCtx): Promise<Actor> {
  return await getActorFromArgs(ctx)
}

export async function getActorFromArgs(
  ctx: PlaygroundCtx,
  args?: ServiceAuthArgs,
): Promise<Actor> {
  const serviceActor = args?._serviceActor
  if (args?._serviceKey && serviceActor?.userId && serviceActor.role && verifyKey(args._serviceKey, resolveExpectedServiceKey())) {
    if (serviceActor.role === 'owner'
      || serviceActor.role === 'admin'
      || serviceActor.role === 'member'
      || serviceActor.role === 'viewer'
    ) {
      return {
        kind: 'user',
        userId: serviceActor.userId,
        role: serviceActor.role,
        ...(serviceActor.tenantId ? { tenantId: serviceActor.tenantId } : {}),
      }
    }
  }

  const auth = await getAuth(ctx)
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

export function getServiceActor(
  key: string,
  actor: { serviceId: string; role: Role; tenantId?: string },
): Actor {
  if (!verifyKey(key, resolveExpectedServiceKey())) return null
  return { kind: 'service', ...actor }
}
