import { getIdentity, verifyKey } from 'better-convex-nuxt/auth'
import type { GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import type { DataModel } from '../_generated/dataModel'

export type Actor =
  | { kind: 'user'; userId: string; role: string; tenantId: string }
  | { kind: 'service'; serviceId: string; userId: string; role: string; tenantId: string }
  | null

type ServiceAuthArgs = {
  _serviceKey?: string
  _serviceActor?: {
    userId: string
    role: string
    tenantId?: string
  }
}

type TeamTodoCtx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>

export async function getActor(ctx: TeamTodoCtx, args?: ServiceAuthArgs): Promise<Actor> {
  const serviceActor =
    args?._serviceKey && args._serviceActor?.tenantId
      ? getServiceActor(args._serviceKey, {
          serviceId: 'service',
          userId: args._serviceActor.userId,
          role: args._serviceActor.role,
          tenantId: args._serviceActor.tenantId,
        })
      : null
  if (serviceActor) return serviceActor

  const identity = await getIdentity(ctx)
  if (!identity) return null

  const user = await ctx.db
    .query('users')
    .withIndex('by_auth_id', (q) => q.eq('authId', identity.subject))
    .first()

  if (!user?.workspaceId) return null

  return {
    kind: 'user',
    userId: user.authId,
    role: user.role,
    tenantId: user.workspaceId,
  }
}

export function getServiceActor(
  key: string,
  actor: { serviceId: string; userId: string; role: string; tenantId: string },
): Actor {
  const expected = process.env.CONVEX_SERVICE_KEY?.trim()
  if (!expected) return null
  if (!verifyKey(key, expected)) return null
  return {
    kind: 'service',
    serviceId: actor.serviceId,
    userId: actor.userId,
    role: actor.role,
    tenantId: actor.tenantId,
  }
}
