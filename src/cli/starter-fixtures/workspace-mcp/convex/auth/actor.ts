import { getAuth, getSubjectValue, type DefaultActor } from '@lupinum/trellis/auth'
import type { GenericActionCtx, GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import type { DataModel, Id } from '../_generated/dataModel'
import type { Role, WorkspacePrincipal } from './principal'

type WorkspaceCtx =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>
  | GenericActionCtx<DataModel>

export type Actor = DefaultActor & {
  role: Role
  tenantId: Id<'workspaces'>
}

export type PermissionActor = DefaultActor & {
  role: Role
  tenantId?: Id<'workspaces'>
}

async function loadActorByAuthId(
  ctx: WorkspaceCtx,
  authId: string,
): Promise<PermissionActor | null> {
  if (!('db' in ctx)) return null

  const user = await ctx.db
    .query('users')
    .withIndex('by_auth_id', (q) => q.eq('authId', authId))
    .first()

  if (!user) return null

  return {
    kind: 'user',
    userId: user.authId,
    role: (user.role ?? 'viewer') as Role,
    tenantId: user.workspaceId as Id<'workspaces'> | undefined,
  }
}

function missingUserRowMessage(authId: string): string {
  return [
    `Expected a Trellis users row for auth subject "${authId}", but none was found.`,
    'Ensure convex/auth.ts exports onCreate, onUpdate, and onDelete from authComponent.triggersApi().',
    'If those exports are already correct, verify the Trellis auth bootstrap is enabled and healthy.',
  ].join(' ')
}

function requirePermissionActor(authId: string, actor: PermissionActor | null): PermissionActor {
  if (actor) return actor
  throw new Error(missingUserRowMessage(authId))
}

export async function getActorFromPrincipal(
  ctx: WorkspaceCtx,
  _args: Record<string, unknown>,
  principal: WorkspacePrincipal,
  delegation: { subject: string } | null,
): Promise<Actor | null> {
  const delegatedAuthId = getSubjectValue(delegation?.subject, 'user')

  if (delegatedAuthId) {
    const actor = requirePermissionActor(
      delegatedAuthId,
      await loadActorByAuthId(ctx, delegatedAuthId),
    )
    return actor?.tenantId ? { ...actor, tenantId: actor.tenantId } : null
  }

  switch (principal.kind) {
    case 'anonymous':
      return null
    case 'agent':
      return null
    case 'user': {
      const actor = requirePermissionActor(
        principal.userId,
        await loadActorByAuthId(ctx, principal.userId),
      )
      return actor?.tenantId ? { ...actor, tenantId: actor.tenantId } : null
    }
  }
}

export async function getPermissionActor(ctx: WorkspaceCtx): Promise<PermissionActor | null> {
  const auth = await getAuth(ctx)
  if (!auth) return null
  return requirePermissionActor(auth.subject, await loadActorByAuthId(ctx, auth.subject))
}

export async function getActor(ctx: WorkspaceCtx): Promise<Actor | null> {
  const actor = await getPermissionActor(ctx)
  return actor?.tenantId ? { ...actor, tenantId: actor.tenantId } : null
}
