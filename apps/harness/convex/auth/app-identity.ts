import { getAuth, getSubjectValue } from '@lupinum/trellis/auth'
import type { ActingFor } from '@lupinum/trellis/backend'
import type { GenericActionCtx, GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import type { DataModel } from '../_generated/dataModel'
import type { InternalHarnessCaller, Role } from './caller'

export type { Role } from './caller'

export type AppIdentity = { kind: 'user'; userId: string; role: Role; workspaceId?: string } | null

type InternalHarnessCtx =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>
  | GenericActionCtx<DataModel>

async function loadActorByAuthId(ctx: InternalHarnessCtx, authId: string): Promise<AppIdentity> {
  if (!('db' in ctx)) {
    throw new Error('Internal harness appIdentity resolution requires a query or mutation context.')
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
    ...(user.organizationId ? { workspaceId: user.organizationId } : {}),
  }
}

export async function getAppIdentityFromCaller(
  ctx: InternalHarnessCtx,
  _args: Record<string, unknown>,
  caller: InternalHarnessCaller,
  actingFor: ActingFor | null,
): Promise<AppIdentity> {
  const delegatedUserId = getSubjectValue(actingFor?.subject, 'user')

  if (delegatedUserId) {
    return await loadActorByAuthId(ctx, delegatedUserId)
  }

  switch (caller.kind) {
    case 'anonymous':
      return null
    case 'agent':
      return null
    case 'user':
      return await loadActorByAuthId(ctx, caller.userId)
  }
}

export async function getAppIdentity(ctx: InternalHarnessCtx): Promise<AppIdentity> {
  const auth = await getAuth(ctx)
  if (!auth) return null
  return await loadActorByAuthId(ctx, auth.subject)
}
