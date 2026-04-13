import { getAuth, type DefaultActor } from '@lupinum/trellis/auth'
import type { GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import type { DataModel, Id } from '../_generated/dataModel'
import type { Role, TeamTodoPrincipal } from './principal'

type TeamTodoCtx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>

export type { Role } from './principal'

export type Actor = DefaultActor & {
  role: Role
  tenantId?: Id<'workspaces'>
}

async function loadActorByAuthId(ctx: TeamTodoCtx, authId: string): Promise<Actor | null> {
  const user = await ctx.db
    .query('users')
    .withIndex('by_auth_id', (q) => q.eq('authId', authId))
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
    case 'mcp':
      return {
        kind: 'user',
        userId: principal.userId,
        role: principal.role,
        tenantId: principal.tenantId,
      }
    case 'user':
      return await loadActorByAuthId(ctx, principal.userId)
  }
}

export async function getActor(ctx: TeamTodoCtx): Promise<Actor | null> {
  const auth = await getAuth(ctx)
  if (!auth) return null
  return await loadActorByAuthId(ctx, auth.subject)
}
