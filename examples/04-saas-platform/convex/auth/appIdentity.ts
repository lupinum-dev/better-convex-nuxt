import { getAuth, type DefaultAppIdentity } from '@lupinum/trellis/auth'
import type { GenericActionCtx, GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import type { DataModel, Id } from '../_generated/dataModel'
import type { ProjectBoardPrincipal, Role } from './caller'

type ProjectBoardCtx =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>
  | GenericActionCtx<DataModel>

export type AppIdentity = DefaultAppIdentity & {
  role: Role
  workspaceId?: Id<'workspaces'>
}

async function loadActorByAuthId(
  ctx: ProjectBoardCtx,
  authId: string,
): Promise<AppIdentity | null> {
  if (!('db' in ctx)) {
    throw new Error('ProjectBoard appIdentity resolution requires a query or mutation context.')
  }

  const user = await ctx.db
    .query('users')
    .withIndex('by_auth_id', (q: any) => q.eq('authId', authId))
    .first()

  if (!user) return null

  return {
    kind: 'user',
    userId: user.authId,
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
      return await loadActorByAuthId(ctx, caller.userId)
  }
}

export async function getAppIdentity(ctx: ProjectBoardCtx): Promise<AppIdentity | null> {
  const auth = await getAuth(ctx)
  if (!auth) return null
  return await loadActorByAuthId(ctx, auth.subject)
}
