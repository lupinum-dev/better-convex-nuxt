import type { DefaultActor } from '@lupinum/trellis/auth'
import type { GenericActionCtx } from 'convex/server'

import type { Doc, Id } from '../_generated/dataModel'
import type { DataModel } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import type { KanbanPrincipal } from './principal'

type KanbanCtx = QueryCtx | MutationCtx | GenericActionCtx<DataModel>

export type Role = Doc<'memberships'>['role']

export type Actor = DefaultActor & {
  role: Role
  tenantId: Id<'workspaces'>
  membershipId: Id<'memberships'>
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

  if (!user?.activeWorkspaceId) return null
  const workspaceId = user.activeWorkspaceId

  const membership = await ctx.db
    .query('memberships')
    .withIndex('by_user_workspace', (q) =>
      q.eq('userId', user.authId).eq('workspaceId', workspaceId),
    )
    .first()

  if (!membership) return null

  return {
    kind: 'user',
    userId: user.authId,
    role: membership.role,
    tenantId: workspaceId,
    membershipId: membership._id,
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
