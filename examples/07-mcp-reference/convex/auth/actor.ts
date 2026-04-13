import { getAuth, type DefaultActor } from '@lupinum/trellis/auth'
import type { GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import type { DataModel, Id } from '../_generated/dataModel'
import type { McpReferencePrincipal, Role } from './principal'

type McpReferenceCtx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>

export type Actor = DefaultActor & {
  role: Role
  tenantId: Id<'workspaces'>
}

type PermissionActor = DefaultActor & {
  role: Role
  tenantId?: Id<'workspaces'>
}

async function loadActorByAuthId(ctx: McpReferenceCtx, authId: string): Promise<PermissionActor | null> {
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
  ctx: McpReferenceCtx,
  _args: Record<string, unknown>,
  principal: McpReferencePrincipal,
): Promise<Actor | null> {
  switch (principal.kind) {
    case 'anonymous':
      return null
    case 'mcp':
      return principal.tenantId
        ? {
            kind: 'user',
            userId: principal.userId,
            role: principal.role,
            tenantId: principal.tenantId,
          }
        : null
    case 'user': {
      const actor = await loadActorByAuthId(ctx, principal.userId)
      return actor?.tenantId ? { ...actor, tenantId: actor.tenantId } : null
    }
  }
}

export async function getPermissionActor(ctx: McpReferenceCtx): Promise<PermissionActor | null> {
  const auth = await getAuth(ctx)
  if (!auth) return null
  return await loadActorByAuthId(ctx, auth.subject)
}

export async function getActor(ctx: McpReferenceCtx): Promise<Actor | null> {
  const actor = await getPermissionActor(ctx)
  return actor?.tenantId ? { ...actor, tenantId: actor.tenantId } : null
}
