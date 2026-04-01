/**
 * Why this file exists:
 * The knowledge base actor includes managerId for team hierarchy visibility.
 */
import { getAuth } from 'better-convex-nuxt/auth'
import type { GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import type { DataModel, Doc, Id } from '../_generated/dataModel'

export type Actor = {
  kind: 'user'
  userId: string
  role: Doc<'users'>['role']
  tenantId: Id<'workspaces'>
  managerId?: string
} | null

type Ctx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>

export async function getActor(ctx: Ctx): Promise<Actor> {
  const auth = await getAuth(ctx)
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
    managerId: user.managerId,
  }
}
