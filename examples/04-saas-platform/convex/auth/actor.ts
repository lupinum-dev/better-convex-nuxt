import { getAuth, type DefaultActor } from '@lupinum/trellis/auth'
import type { GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import type { DataModel, Doc, Id } from '../_generated/dataModel'
import type { ProjectBoardPrincipal, Role } from './principal'

type ProjectBoardCtx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>

export type Actor = DefaultActor & {
  role: Role
  tenantId?: Id<'workspaces'>
  plan: Doc<'workspaces'>['plan']
}

async function loadActorByAuthId(ctx: ProjectBoardCtx, authId: string): Promise<Actor | null> {
  const user = await ctx.db
    .query('users')
    .withIndex('by_auth_id', (q) => q.eq('authId', authId))
    .first()

  if (!user) return null

  const workspace = user.workspaceId ? await ctx.db.get(user.workspaceId) : null

  return {
    kind: 'user',
    userId: user.authId,
    role: user.role as Role,
    tenantId: user.workspaceId as Id<'workspaces'> | undefined,
    plan: (workspace?.plan ?? 'free') as Doc<'workspaces'>['plan'],
  }
}

export async function getActorFromPrincipal(
  ctx: ProjectBoardCtx,
  _args: Record<string, unknown>,
  principal: ProjectBoardPrincipal,
): Promise<Actor | null> {
  switch (principal.kind) {
    case 'anonymous':
      return null
    case 'agent': {
      const actor = await loadActorByAuthId(ctx, principal.userId)
      if (!actor) return null
      return {
        ...actor,
        role: principal.role,
        tenantId: principal.tenantId ?? actor.tenantId,
      }
    }
    case 'user':
      return await loadActorByAuthId(ctx, principal.userId)
  }
}

export async function getActor(ctx: ProjectBoardCtx): Promise<Actor | null> {
  const auth = await getAuth(ctx)
  if (!auth) return null
  return await loadActorByAuthId(ctx, auth.subject)
}
