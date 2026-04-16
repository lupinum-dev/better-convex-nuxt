import { getAuth, type DefaultActor } from '@lupinum/trellis/auth'
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

export async function getActorFromPrincipal(
  ctx: TeamTodoCtx,
  _args: Record<string, unknown>,
  principal: TeamTodoPrincipal,
): Promise<Actor | null> {
  switch (principal.kind) {
    case 'anonymous':
      return null
    case 'agent':
      return await loadActorByAuthId(ctx, principal.userId)
    case 'user':
      return await loadActorByAuthId(ctx, principal.userId)
  }
}

export async function getActor(ctx: TeamTodoCtx): Promise<Actor | null> {
  const auth = await getAuth(ctx)
  if (!auth) return null
  return await loadActorByAuthId(ctx, auth.subject)
}
