import { getAuth } from '@lupinum/trellis/auth'
import type { Delegation } from '@lupinum/trellis/functions'
import type { GenericActionCtx, GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import type { DataModel } from '../_generated/dataModel'
import type { InternalHarnessPrincipal, Role } from './principal'

export type { Role } from './principal'

export type Actor = { kind: 'user'; userId: string; role: Role; tenantId?: string } | null

type InternalHarnessCtx =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>
  | GenericActionCtx<DataModel>

async function loadActorByAuthId(ctx: InternalHarnessCtx, authId: string): Promise<Actor> {
  if (!('db' in ctx)) {
    throw new Error('Internal harness actor resolution requires a query or mutation context.')
  }

  const user = await ctx.db
    .query('users')
    .withIndex('by_auth_id', (q: any) => q.eq('authId', authId))
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
  delegation: Delegation | null,
): Promise<Actor> {
  const delegatedUserId =
    typeof delegation?.subject === 'string' && delegation.subject.startsWith('user:')
      ? delegation.subject.slice('user:'.length)
      : null

  if (delegatedUserId) {
    return await loadActorByAuthId(ctx, delegatedUserId)
  }

  switch (principal.kind) {
    case 'anonymous':
      return null
    case 'agent':
      return null
    case 'user':
      return await loadActorByAuthId(ctx, principal.userId)
  }
}

export async function getActor(ctx: InternalHarnessCtx): Promise<Actor> {
  const auth = await getAuth(ctx)
  if (!auth) return null
  return await loadActorByAuthId(ctx, auth.subject)
}
