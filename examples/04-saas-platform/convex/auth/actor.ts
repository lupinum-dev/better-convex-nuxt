/**
 * Why this file differs from the default tenant-scoped pattern:
 * The board example supports trusted callers from server-side routes, so the actor can resolve
 * from either Better Auth or explicit trusted args. `userId` is the auth-subject string stored on
 * owner fields, not a Convex user document id.
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
  plan: Doc<'workspaces'>['plan']
} | null

type ProjectBoardCtx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>

export async function getActor(ctx: ProjectBoardCtx, args?: unknown): Promise<Actor> {
  const trusted = getTrustedCaller(args)
  if (trusted) {
    return await resolveActor(ctx, { subject: trusted.userId })
  }

  return await resolveActor(ctx, await getAuth(ctx))
}

export async function resolveActor(
  ctx: ProjectBoardCtx,
  auth: AuthIdentity | null,
): Promise<Actor> {
  if (!auth) return null

  const user = await ctx.db
    .query('users')
    .withIndex('by_auth_id', (q) => q.eq('authId', auth.subject))
    .first()

  if (!user?.workspaceId) return null

  const workspace = await ctx.db.get(user.workspaceId)
  if (!workspace) return null

  return {
    kind: 'user',
    userId: user.authId,
    role: user.role,
    tenantId: user.workspaceId,
    plan: workspace.plan,
  }
}
