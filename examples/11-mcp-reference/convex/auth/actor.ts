import type { AuthIdentity } from 'better-convex-nuxt/auth'
import { getTrustedCaller } from 'better-convex-nuxt/auth'
import type { GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import type { DataModel, Id } from '../_generated/dataModel'

export type Actor =
  | { kind: 'user'; userId: string; role: string; tenantId: Id<'workspaces'> }
  | { kind: 'service'; serviceId: string; userId: string; role: string; tenantId: Id<'workspaces'> }
  | null

type McpReferenceCtx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>

export async function getActor(ctx: McpReferenceCtx, args?: unknown): Promise<Actor> {
  const trusted = getTrustedCaller(args)
  if (trusted) {
    if (!trusted.tenantId) return null
    return {
      kind: 'service',
      serviceId: 'service',
      userId: trusted.userId,
      role: trusted.role,
      tenantId: trusted.tenantId as Id<'workspaces'>,
    }
  }

  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return null
  return await resolveActor(ctx, {
    subject: identity.subject,
    ...(typeof identity.email === 'string' ? { email: identity.email } : {}),
    ...(typeof identity.name === 'string' ? { name: identity.name } : {}),
  })
}

export async function resolveActor(ctx: McpReferenceCtx, auth: AuthIdentity | null): Promise<Actor> {
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
