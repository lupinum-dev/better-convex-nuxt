import { getAuth, getSubjectValue, type DefaultActor } from '@lupinum/trellis/auth'
import type { Delegation } from '@lupinum/trellis/backend'
import type { GenericActionCtx, GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import type { DataModel, Id } from '../_generated/dataModel'
import type { McpReferencePrincipal, Role } from './principal'

type McpReferenceCtx =
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

type ForwardedIdentityCtx = McpReferenceCtx & {
  principal: () => Promise<McpReferencePrincipal>
  delegation: () => Promise<Delegation | null>
}

function hasForwardedIdentity(ctx: McpReferenceCtx): ctx is ForwardedIdentityCtx {
  return 'principal' in ctx && typeof ctx.principal === 'function'
}

async function loadUserActorByAuthId(
  ctx: McpReferenceCtx,
  authId: string,
): Promise<PermissionActor | null> {
  if (!('db' in ctx)) {
    throw new Error('MCP reference actor resolution requires a query or mutation context.')
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

function getUserIdFromPrincipal(principal: McpReferencePrincipal): string | null {
  if (principal.kind !== 'user') return null
  return principal.userId
}

function requireTenantActor(actor: PermissionActor | null): Actor | null {
  if (!actor?.tenantId) return null
  return { ...actor, tenantId: actor.tenantId }
}

async function resolvePermissionActorFromCaller(
  ctx: McpReferenceCtx,
  principal: McpReferencePrincipal,
  delegation: Delegation | null,
): Promise<PermissionActor | null> {
  // When a non-user caller acts for a user, permissions resolve as that user.
  const delegatedUserId = getDelegatedUserId(delegation)
  if (delegatedUserId) {
    return await loadUserActorByAuthId(ctx, delegatedUserId)
  }

  // Browser-style calls resolve directly from the user principal.
  const directUserId = getUserIdFromPrincipal(principal)
  if (!directUserId) return null

  return await loadUserActorByAuthId(ctx, directUserId)
}

export async function getActorFromPrincipal(
  ctx: McpReferenceCtx,
  _args: Record<string, unknown>,
  principal: McpReferencePrincipal,
  delegation: Delegation | null,
): Promise<Actor | null> {
  const actor = await resolvePermissionActorFromCaller(ctx, principal, delegation)
  return requireTenantActor(actor)
}

export async function getPermissionActor(ctx: McpReferenceCtx): Promise<PermissionActor | null> {
  // Protected handlers expose principal/delegation accessors, so prefer those
  // over raw browser auth when they are available.
  if (hasForwardedIdentity(ctx)) {
    const principal = await ctx.principal()
    const delegation = await ctx.delegation()
    return await resolvePermissionActorFromCaller(ctx, principal, delegation)
  }

  // Permission context queries can still run outside the protected handler
  // surface, so fall back to the signed-in browser user identity there.
  const auth = await getAuth(ctx)
  if (!auth) return null
  return await loadUserActorByAuthId(ctx, auth.subject)
}

export async function getActor(ctx: McpReferenceCtx): Promise<Actor | null> {
  const actor = await getPermissionActor(ctx)
  return requireTenantActor(actor)
}
