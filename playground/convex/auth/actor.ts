import type { GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import { resolveUserActor, verifyKey } from 'better-convex-nuxt/auth'
import type { UserActor } from 'better-convex-nuxt/auth'

import type { DataModel } from '../_generated/dataModel'
import { PLAYGROUND_LOCAL_SERVICE_KEY } from '../../shared/dev-service-key'

export type Role = 'owner' | 'admin' | 'member' | 'viewer'

export type Actor =
  | UserActor<Role>
  | { kind: 'service'; serviceId: string; role: Role; tenantId?: string }
  | null

type PlaygroundCtx =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>

function resolveExpectedServiceKey(): string {
  return process.env.CONVEX_SERVICE_KEY?.trim() || PLAYGROUND_LOCAL_SERVICE_KEY
}

export async function getActor(ctx: PlaygroundCtx): Promise<Actor> {
  return await resolveUserActor<Role>(ctx, { tenantIdField: 'organizationId' })
}

export function getServiceActor(
  key: string,
  actor: { serviceId: string; role: Role; tenantId?: string },
): Actor {
  if (!verifyKey(key, resolveExpectedServiceKey())) return null
  return { kind: 'service', ...actor }
}
