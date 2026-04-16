import { getAuth, type DefaultActor } from '@lupinum/trellis/auth'
import type { GenericActionCtx, GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import type { DataModel, Doc, Id } from '../_generated/dataModel'
import type { ProjectBoardPrincipal, Role } from './principal'

type ProjectBoardCtx =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>
  | GenericActionCtx<DataModel>

export type Actor = DefaultActor & {
  role: Role
  tenantId?: Id<'workspaces'>
  plan: Doc<'workspaces'>['plan']
}

async function loadActorByAuthId(ctx: ProjectBoardCtx, authId: string): Promise<Actor | null> {
  if (!('db' in ctx)) {
    throw new Error('ProjectBoard actor resolution requires a query or mutation context.')
  }

  const user = await ctx.db
    .query('users')
    .withIndex('by_auth_id', (q: any) => q.eq('authId', authId))
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
    case 'user':
      return await loadActorByAuthId(ctx, principal.userId)
  }
}

export async function getActor(ctx: ProjectBoardCtx): Promise<Actor | null> {
  const auth = await getAuth(ctx)
  if (!auth) return null
  return await loadActorByAuthId(ctx, auth.subject)
}
