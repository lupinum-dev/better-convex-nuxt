import type { DefaultActor } from '@lupinum/trellis/auth'
import type { GenericActionCtx, GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import type { DataModel, Id } from '../_generated/dataModel'
import type { KanbanPrincipal } from './principal'

type KanbanCtx =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>
  | GenericActionCtx<DataModel>

export type Role = 'owner' | 'admin' | 'member' | 'viewer'

export type Actor = DefaultActor & {
  role: Role
  tenantId?: Id<'workspaces'>
  displayName?: string | null
  email?: string | null
}

async function loadActor(ctx: KanbanCtx, authId: string): Promise<Actor | null> {
  if (!('db' in ctx)) {
    throw new Error('Kanban actor resolution requires a query or mutation context.')
  }

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
    displayName: user.displayName ?? null,
    email: user.email ?? null,
  }
}

export async function getActorFromPrincipal(
  ctx: KanbanCtx,
  _args: Record<string, unknown>,
  principal: KanbanPrincipal,
): Promise<Actor | null> {
  if (principal.kind === 'anonymous') return null
  return await loadActor(ctx, principal.userId)
}
