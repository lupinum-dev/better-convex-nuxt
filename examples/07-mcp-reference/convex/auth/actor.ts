/**
 * Why this file differs from the default tenant-scoped pattern:
 * This example teaches both browser and trusted non-browser lanes. `userId` remains the auth
 * subject stored on ownership fields, not a Convex user document id.
 */
import type { AuthIdentity } from 'better-convex-nuxt/auth'
import { getAuth } from 'better-convex-nuxt/auth'
import { getTrustedCaller } from 'better-convex-nuxt/trusted-caller'
import type { GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import type { DataModel, Doc, Id } from '../_generated/dataModel'

export type Actor = {
  kind: 'user'
  userId: string
  role: Doc<'users'>['role']
  tenantId: Id<'workspaces'>
} | null

type McpReferenceCtx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>

export async function getActor(ctx: McpReferenceCtx): Promise<Actor> {
  const trusted = getTrustedCaller(ctx)
  if (trusted) {
    return await resolveActor(ctx, { subject: trusted.userId })
  }

  return await resolveActor(ctx, await getAuth(ctx))
}

export async function resolveActor(
  ctx: McpReferenceCtx,
  auth: AuthIdentity | null,
): Promise<Actor> {
  if (!auth) return null

  const user = await ctx.db
    .query('users')
    .withIndex('by_auth_id', (q) => q.eq('authId', auth.subject))
    .first()

  if (!user?.workspaceId) return null

  return {
    kind: 'user',
    userId: user.authId,
    role: user.role,
    tenantId: user.workspaceId,
  }
}
