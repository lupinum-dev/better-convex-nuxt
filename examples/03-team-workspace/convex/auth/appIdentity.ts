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

async function loadActorByAuthKey(ctx: TeamTodoCtx, authKey: string): Promise<AppIdentity | null> {
  if (!('db' in ctx)) {
    throw new Error('TeamTodo appIdentity resolution requires a query or mutation context.')
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

async function loadActorByUserId(ctx: TeamTodoCtx, userId: string): Promise<AppIdentity | null> {
  if (!('db' in ctx)) {
    throw new Error('TeamTodo appIdentity resolution requires a query or mutation context.')
  }

  const user = await ctx.db.get(userId as Id<'users'>)
  if (!user) return null

  return {
    kind: 'user',
    userId: user._id,
    authKey: user.authKey,
    role: user.role as Role,
    workspaceId: user.workspaceId as Id<'workspaces'> | undefined,
  }
}

function getDelegatedUserId(actingFor: ActingFor | null): string | null {
  return getSubjectValue(actingFor?.subject, 'user')
}

function getAgentUserIdFromPrincipal(caller: TeamTodoPrincipal): string | null {
  if (caller.kind === 'agent') {
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
    return await loadActorByUserId(ctx, delegatedUserId)
  }

  if (caller.kind === 'user') {
    return await loadActorByAuthKey(ctx, caller.authKey)
  }

  const directUserId = getAgentUserIdFromPrincipal(caller)
  if (!directUserId) return null

  return await loadActorByUserId(ctx, directUserId)
}

export async function getAppIdentity(ctx: TeamTodoCtx): Promise<AppIdentity | null> {
  const auth = await getAuth(ctx)
  if (!auth) return null
  return await loadActorByAuthKey(ctx, auth.authKey)
}
