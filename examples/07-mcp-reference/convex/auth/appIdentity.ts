import { getAuth, getSubjectValue, type DefaultAppIdentity } from '@lupinum/trellis/auth'
import type { ActingFor } from '@lupinum/trellis/backend'
import type { GenericActionCtx, GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import type { DataModel, Id } from '../_generated/dataModel'
import type { McpReferencePrincipal, Role } from './caller'

type McpReferenceCtx =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>
  | GenericActionCtx<DataModel>

export type AppIdentity = DefaultAppIdentity & {
  role: Role
  workspaceId: Id<'workspaces'>
}

export type AccessIdentity = DefaultAppIdentity & {
  role: Role
  workspaceId?: Id<'workspaces'>
}

type ForwardedIdentityCtx = McpReferenceCtx & {
  caller: () => Promise<McpReferencePrincipal>
  actingFor: () => Promise<ActingFor | null>
}

function hasForwardedIdentity(ctx: McpReferenceCtx): ctx is ForwardedIdentityCtx {
  return 'caller' in ctx && typeof ctx.caller === 'function'
}

async function loadUserActorByAuthId(
  ctx: McpReferenceCtx,
  authId: string,
): Promise<AccessIdentity | null> {
  if (!('db' in ctx)) {
    throw new Error('MCP reference appIdentity resolution requires a query or mutation context.')
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
    workspaceId: user.workspaceId as Id<'workspaces'> | undefined,
  }
}

function getDelegatedUserId(actingFor: ActingFor | null): string | null {
  return getSubjectValue(actingFor?.subject, 'user')
}

function getUserIdFromPrincipal(caller: McpReferencePrincipal): string | null {
  if (caller.kind !== 'user') return null
  return caller.userId
}

function requireTenantActor(appIdentity: AccessIdentity | null): AppIdentity | null {
  if (!appIdentity?.workspaceId) return null
  return { ...appIdentity, workspaceId: appIdentity.workspaceId }
}

async function resolveAccessIdentityFromCaller(
  ctx: McpReferenceCtx,
  caller: McpReferencePrincipal,
  actingFor: ActingFor | null,
): Promise<AccessIdentity | null> {
  // When a non-user caller acts for a user, permissions resolve as that user.
  const delegatedUserId = getDelegatedUserId(actingFor)
  if (delegatedUserId) {
    return await loadUserActorByAuthId(ctx, delegatedUserId)
  }

  // Browser-style calls resolve directly from the user caller.
  const directUserId = getUserIdFromPrincipal(caller)
  if (!directUserId) return null

  return await loadUserActorByAuthId(ctx, directUserId)
}

export async function getAppIdentityFromCaller(
  ctx: McpReferenceCtx,
  _args: Record<string, unknown>,
  caller: McpReferencePrincipal,
  actingFor: ActingFor | null,
): Promise<AppIdentity | null> {
  const appIdentity = await resolveAccessIdentityFromCaller(ctx, caller, actingFor)
  return requireTenantActor(appIdentity)
}

export async function getAccessIdentity(ctx: McpReferenceCtx): Promise<AccessIdentity | null> {
  // Protected handlers expose caller/actingFor accessors, so prefer those
  // over raw browser auth when they are available.
  if (hasForwardedIdentity(ctx)) {
    const caller = await ctx.caller()
    const actingFor = await ctx.actingFor()
    return await resolveAccessIdentityFromCaller(ctx, caller, actingFor)
  }

  // Access context queries can still run outside the protected handler
  // surface, so fall back to the signed-in browser user identity there.
  const auth = await getAuth(ctx)
  if (!auth) return null
  return await loadUserActorByAuthId(ctx, auth.subject)
}

export async function getAppIdentity(ctx: McpReferenceCtx): Promise<AppIdentity | null> {
  const appIdentity = await getAccessIdentity(ctx)
  return requireTenantActor(appIdentity)
}
