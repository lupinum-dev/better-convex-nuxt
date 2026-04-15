import { getAuth } from '@lupinum/trellis/auth'
import type { GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import type { DataModel } from '../_generated/dataModel'
import type { InternalHarnessPrincipal, Role } from './principal'

export type { Role } from './principal'

export type Actor = { kind: 'user'; userId: string; role: Role; tenantId?: string } | null

type InternalHarnessCtx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>

async function loadActorByAuthId(ctx: InternalHarnessCtx, authId: string): Promise<Actor> {
  const user = await ctx.db
    .query('users')
    .withIndex('by_auth_id', (q) => q.eq('authId', authId))
    .first()

  if (!user) return null

  return {
    kind: 'user',
    userId: user.authId,
    role: user.role,
    ...(user.organizationId ? { tenantId: user.organizationId } : {}),
  }
}

export async function getActorFromPrincipal(
  ctx: InternalHarnessCtx,
  _args: Record<string, unknown>,
  principal: InternalHarnessPrincipal,
): Promise<Actor> {
  switch (principal.kind) {
    case 'anonymous':
      return null
    case 'agent':
      return {
        kind: 'user',
        userId: principal.userId,
        role: principal.role,
        ...(principal.tenantId ? { tenantId: principal.tenantId } : {}),
      }
    case 'user':
      return await loadActorByAuthId(ctx, principal.userId)
  }
}

export async function getActor(ctx: InternalHarnessCtx): Promise<Actor> {
  const auth = await getAuth(ctx)
  if (!auth) return null
  return await loadActorByAuthId(ctx, auth.subject)
}
