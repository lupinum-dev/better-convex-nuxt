import { getAuth, getSubjectValue, type DefaultActor } from '@lupinum/trellis/auth'
import type { Delegation } from '@lupinum/trellis/functions'
import type { GenericActionCtx, GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import type { DataModel, Id } from '../_generated/dataModel'
import type { Role, TeamTodoPrincipal } from './principal'

type TeamTodoCtx =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>
  | GenericActionCtx<DataModel>

export type { Role } from './principal'

export type Actor = DefaultActor & {
  role: Role
  tenantId?: Id<'workspaces'>
}

async function loadActorByAuthId(ctx: TeamTodoCtx, authId: string): Promise<Actor | null> {
  if (!('db' in ctx)) {
    throw new Error('TeamTodo actor resolution requires a query or mutation context.')
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
    tenantId: user.workspaceId as Id<'workspaces'> | undefined,
  }
}

function getDelegatedUserId(delegation: Delegation | null): string | null {
  return getSubjectValue(delegation?.subject, 'user')
}

function getUserIdFromPrincipal(principal: TeamTodoPrincipal): string | null {
  if (principal.kind === 'user' || principal.kind === 'agent') {
    return principal.userId
  }

  return null
}

export async function getActorFromPrincipal(
  ctx: TeamTodoCtx,
  _args: Record<string, unknown>,
  principal: TeamTodoPrincipal,
  delegation: Delegation | null,
): Promise<Actor | null> {
  const delegatedUserId = getDelegatedUserId(delegation)
  if (delegatedUserId) {
    return await loadActorByAuthId(ctx, delegatedUserId)
  }

  const directUserId = getUserIdFromPrincipal(principal)
  if (!directUserId) return null

  return await loadActorByAuthId(ctx, directUserId)
}

export async function getActor(ctx: TeamTodoCtx): Promise<Actor | null> {
  const auth = await getAuth(ctx)
  if (!auth) return null
  return await loadActorByAuthId(ctx, auth.subject)
}
