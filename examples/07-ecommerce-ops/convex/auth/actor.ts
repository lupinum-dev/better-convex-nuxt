import type { GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import { resolveUserActor } from 'better-convex-nuxt/auth'
import type { UserActor } from 'better-convex-nuxt/auth'

import type { DataModel } from '../_generated/dataModel'

export type Actor =
  | UserActor
  | { kind: 'service'; serviceId: string; role: string; tenantId: string }
  | null

type Ctx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>

export async function getActor(ctx: Ctx): Promise<Actor> {
  return await resolveUserActor(ctx)
}
