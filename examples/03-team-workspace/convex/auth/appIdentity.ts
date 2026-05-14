import { getAuth, getSubjectValue, type DefaultAppIdentity } from '@lupinum/trellis/auth'
import type { ActingFor } from '@lupinum/trellis/backend'
import type { GenericActionCtx, GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import type { DataModel, Id } from '../_generated/dataModel'
import type { Role, TeamTodoPrincipal } from './caller'

type TeamTodoCtx =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>
  | GenericActionCtx<DataModel>

export type { Role } from './caller'

export type AppIdentity = DefaultAppIdentity & {
  role: Role
  workspaceId?: Id<'workspaces'>
}

async function loadActorByAuthId(ctx: TeamTodoCtx, authId: string): Promise<AppIdentity | null> {
  if (!('db' in ctx)) {
    throw new Error('TeamTodo appIdentity resolution requires a query or mutation context.')
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

function getDelegatedUserId(actingFor: ActingFor | null): string | null {
  return getSubjectValue(actingFor?.subject, 'user')
}

function getUserIdFromPrincipal(caller: TeamTodoPrincipal): string | null {
  if (caller.kind === 'user' || caller.kind === 'agent') {
    return caller.userId
  }

  return null
}

export async function getAppIdentityFromCaller(
  ctx: TeamTodoCtx,
  _args: Record<string, unknown>,
  caller: TeamTodoPrincipal,
  actingFor: ActingFor | null,
): Promise<AppIdentity | null> {
  const delegatedUserId = getDelegatedUserId(actingFor)
  if (delegatedUserId) {
    return await loadActorByAuthId(ctx, delegatedUserId)
  }

  const directUserId = getUserIdFromPrincipal(caller)
  if (!directUserId) return null

  return await loadActorByAuthId(ctx, directUserId)
}

export async function getAppIdentity(ctx: TeamTodoCtx): Promise<AppIdentity | null> {
  const auth = await getAuth(ctx)
  if (!auth) return null
  return await loadActorByAuthId(ctx, auth.subject)
}
