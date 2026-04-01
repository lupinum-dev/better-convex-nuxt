/**
 * Why this file differs from the default tenant-scoped pattern:
 * This example introduces the trusted-caller lane, so the actor can resolve from either Better
 * Auth or explicit trusted args. `userId` remains the auth-subject string stored on ownership
 * fields, not a Convex user document id.
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

type TeamTodoCtx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>

export async function getActor(ctx: TeamTodoCtx, args?: unknown): Promise<Actor> {
  const trusted = getTrustedCaller(args)
  if (trusted) {
    return await resolveActor(ctx, { subject: trusted.userId })
  }

  return await resolveActor(ctx, await getAuth(ctx))
}

export async function resolveActor(ctx: TeamTodoCtx, auth: AuthIdentity | null): Promise<Actor> {
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
