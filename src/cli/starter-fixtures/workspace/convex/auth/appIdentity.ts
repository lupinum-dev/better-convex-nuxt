import { getAuth, getSubjectValue } from '@lupinum/trellis/auth'
import type { GenericActionCtx, GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import type { DataModel, Id } from '../_generated/dataModel'
import type { Role, WorkspaceCaller } from './caller'

type WorkspaceCtx =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>
  | GenericActionCtx<DataModel>

type BaseAppIdentity = {
  kind: 'user'
  userId: Id<'users'>
  authKey: string
}

export type AppIdentity = BaseAppIdentity & {
  role: Role
  workspaceId: Id<'workspaces'>
}

export type AccessIdentity = BaseAppIdentity & {
  role: Role
  workspaceId?: Id<'workspaces'>
}

async function loadActorByAuthKey(
  ctx: WorkspaceCtx,
  authKey: string,
): Promise<AccessIdentity | null> {
  if (!('db' in ctx)) return null

  const user = await ctx.db
    .query('users')
    .withIndex('by_auth_key', (q) => q.eq('authKey', authKey))
    .first()

  if (!user) return null

  return {
    kind: 'user',
    userId: user._id,
    authKey: user.authKey,
    role: (user.role ?? 'viewer') as Role,
    workspaceId: user.workspaceId as Id<'workspaces'> | undefined,
  }
}

async function loadActorByUserId(
  ctx: WorkspaceCtx,
  userId: string,
): Promise<AccessIdentity | null> {
  if (!('db' in ctx)) return null
  const user = await ctx.db.get(userId as Id<'users'>)
  if (!user) return null

  return {
    kind: 'user',
    userId: user._id,
    authKey: user.authKey,
    role: (user.role ?? 'viewer') as Role,
    workspaceId: user.workspaceId as Id<'workspaces'> | undefined,
  }
}

function missingUserRowMessage(authKey: string): string {
  return [
    `Expected a Trellis users row for auth key "${authKey}", but none was found.`,
    'Verify the Trellis auth bootstrap is enabled and healthy.',
  ].join(' ')
}

function requireAccessIdentity(
  authKey: string,
  appIdentity: AccessIdentity | null,
): AccessIdentity {
  if (appIdentity) return appIdentity
  throw new Error(missingUserRowMessage(authKey))
}

export async function getAppIdentityFromCaller(
  ctx: WorkspaceCtx,
  _args: Record<string, unknown>,
  caller: WorkspaceCaller,
  actingFor: { subject: string } | null,
): Promise<AppIdentity | null> {
  const delegatedUserId = getSubjectValue(actingFor?.subject, 'user')

  if (delegatedUserId) {
    const appIdentity = requireAccessIdentity(
      delegatedUserId,
      await loadActorByUserId(ctx, delegatedUserId),
    )
    return appIdentity?.workspaceId
      ? { ...appIdentity, workspaceId: appIdentity.workspaceId }
      : null
  }

  switch (caller.kind) {
    case 'anonymous':
      return null
    case 'agent':
      return null
    case 'user': {
      const appIdentity = requireAccessIdentity(
        caller.authKey,
        await loadActorByAuthKey(ctx, caller.authKey),
      )
      return appIdentity?.workspaceId
        ? { ...appIdentity, workspaceId: appIdentity.workspaceId }
        : null
    }
  }
}

export async function getAccessIdentity(ctx: WorkspaceCtx): Promise<AccessIdentity | null> {
  const auth = await getAuth(ctx)
  if (!auth) return null
  return requireAccessIdentity(auth.authKey, await loadActorByAuthKey(ctx, auth.authKey))
}

export async function getAppIdentity(ctx: WorkspaceCtx): Promise<AppIdentity | null> {
  const appIdentity = await getAccessIdentity(ctx)
  return appIdentity?.workspaceId ? { ...appIdentity, workspaceId: appIdentity.workspaceId } : null
}
