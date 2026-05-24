import { getAuth, getSubjectValue } from '@lupinum/trellis/auth'
import type { ActingFor } from '@lupinum/trellis/backend'
import type { GenericActionCtx, GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import type { DataModel, Id } from '../_generated/dataModel'
import type { InternalHarnessCaller, Role } from './caller'

export type { Role } from './caller'

export type AppIdentity = {
  kind: 'user'
  userId: Id<'users'>
  authKey: string
  role: Role
  workspaceId?: Id<'organizations'>
} | null

type InternalHarnessCtx =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>
  | GenericActionCtx<DataModel>

async function loadActorByAuthKey(ctx: InternalHarnessCtx, authKey: string): Promise<AppIdentity> {
  if (!('db' in ctx)) {
    throw new Error('Internal harness appIdentity resolution requires a query or mutation context.')
  }

  const user = await ctx.db
    .query('users')
    .withIndex('by_auth_key', (q: any) => q.eq('authKey', authKey))
    .first()

  if (!user) return null

  return {
    kind: 'user',
    userId: user._id,
    authKey: user.authKey,
    role: user.role,
    ...(user.organizationId ? { workspaceId: user.organizationId } : {}),
  }
}

async function loadActorByUserId(ctx: InternalHarnessCtx, userId: string): Promise<AppIdentity> {
  if (!('db' in ctx)) {
    throw new Error('Internal harness appIdentity resolution requires a query or mutation context.')
  }

  const user = await ctx.db.get(userId as Id<'users'>)
  if (!user) return null

  return {
    kind: 'user',
    userId: user._id,
    authKey: user.authKey,
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
    return await loadActorByUserId(ctx, delegatedUserId)
  }

  switch (caller.kind) {
    case 'anonymous':
      return null
    case 'agent':
      return null
    case 'user':
      return await loadActorByAuthKey(ctx, caller.authKey)
  }
}

export async function getAppIdentity(ctx: InternalHarnessCtx): Promise<AppIdentity> {
  const auth = await getAuth(ctx)
  if (!auth) return null
  return await loadActorByAuthKey(ctx, auth.authKey)
}
