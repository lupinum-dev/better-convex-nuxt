import { getAuth, getSubjectValue, type DefaultAppIdentity } from '@lupinum/trellis/auth'
import type { GenericActionCtx, GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import type { DataModel, Id } from '../_generated/dataModel'
import type { Role, WorkspaceCaller } from './caller'

type WorkspaceCtx =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>
  | GenericActionCtx<DataModel>

export type AppIdentity = DefaultAppIdentity & {
  role: Role
  workspaceId: Id<'workspaces'>
}

export type AccessIdentity = DefaultAppIdentity & {
  role: Role
  workspaceId?: Id<'workspaces'>
}

async function loadActorByAuthId(
  ctx: WorkspaceCtx,
  authId: string,
): Promise<AccessIdentity | null> {
  if (!('db' in ctx)) return null

  const user = await ctx.db
    .query('users')
    .withIndex('by_auth_id', (q) => q.eq('authId', authId))
    .first()

  if (!user) return null

  return {
    kind: 'user',
    userId: user.authId,
    role: (user.role ?? 'viewer') as Role,
    workspaceId: user.workspaceId as Id<'workspaces'> | undefined,
  }
}

function missingUserRowMessage(authId: string): string {
  return [
    `Expected a Trellis users row for auth subject "${authId}", but none was found.`,
    'Ensure convex/auth.ts exports onCreate, onUpdate, and onDelete from authComponent.triggersApi().',
    'If those exports are already correct, verify the Trellis auth bootstrap is enabled and healthy.',
  ].join(' ')
}

function requireAccessIdentity(authId: string, appIdentity: AccessIdentity | null): AccessIdentity {
  if (appIdentity) return appIdentity
  throw new Error(missingUserRowMessage(authId))
}

export async function getAppIdentityFromCaller(
  ctx: WorkspaceCtx,
  _args: Record<string, unknown>,
  caller: WorkspaceCaller,
  actingFor: { subject: string } | null,
): Promise<AppIdentity | null> {
  const delegatedAuthId = getSubjectValue(actingFor?.subject, 'user')

  if (delegatedAuthId) {
    const appIdentity = requireAccessIdentity(
      delegatedAuthId,
      await loadActorByAuthId(ctx, delegatedAuthId),
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
        caller.userId,
        await loadActorByAuthId(ctx, caller.userId),
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
  return requireAccessIdentity(auth.subject, await loadActorByAuthId(ctx, auth.subject))
}

export async function getAppIdentity(ctx: WorkspaceCtx): Promise<AppIdentity | null> {
  const appIdentity = await getAccessIdentity(ctx)
  return appIdentity?.workspaceId ? { ...appIdentity, workspaceId: appIdentity.workspaceId } : null
}
