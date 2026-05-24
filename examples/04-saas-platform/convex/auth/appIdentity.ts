import { getAuth } from '@lupinum/trellis/auth'
import type { GenericActionCtx, GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import type { DataModel, Id } from '../_generated/dataModel'
import type { ProjectBoardPrincipal, Role } from './caller'

type ProjectBoardCtx =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>
  | GenericActionCtx<DataModel>

export type AppIdentity = {
  kind: 'user'
  userId: Id<'users'>
  authKey: string
  role: Role
  workspaceId?: Id<'workspaces'>
}

async function loadActorByAuthKey(
  ctx: ProjectBoardCtx,
  authKey: string,
): Promise<AppIdentity | null> {
  if (!('db' in ctx)) {
    throw new Error('ProjectBoard appIdentity resolution requires a query or mutation context.')
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
    role: user.role as Role,
    workspaceId: user.workspaceId as Id<'workspaces'> | undefined,
  }
}

export async function getAppIdentityFromCaller(
  ctx: ProjectBoardCtx,
  _args: Record<string, unknown>,
  caller: ProjectBoardPrincipal,
): Promise<AppIdentity | null> {
  switch (caller.kind) {
    case 'anonymous':
      return null
    case 'user':
      return await loadActorByAuthKey(ctx, caller.authKey)
  }
}

export async function getAppIdentity(ctx: ProjectBoardCtx): Promise<AppIdentity | null> {
  const auth = await getAuth(ctx)
  if (!auth) return null
  return await loadActorByAuthKey(ctx, auth.authKey)
}
