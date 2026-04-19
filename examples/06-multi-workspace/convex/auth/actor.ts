import { getAuth } from '@lupinum/trellis/auth'
/**
 * Why this file differs from the default tenant-scoped pattern:
 * Agency access resolves authority from `memberships`, not from the user row. The user row only
 * stores the current workspace selection, while `role` comes from the matching membership.
 */
import type { GenericActionCtx, GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import type { DataModel, Doc, Id } from '../_generated/dataModel'

export type Actor = {
  kind: 'user'
  userId: string
  role: Doc<'memberships'>['role']
  tenantId: Id<'workspaces'>
}

type Ctx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel> | GenericActionCtx<DataModel>

export async function getActor(ctx: Ctx): Promise<Actor | null> {
  const auth = await getAuth(ctx)
  if (!auth) return null
  if (!('db' in ctx)) {
    throw new Error('Agency actor resolution requires a query or mutation context.')
  }

  const user = await ctx.db
    .query('users')
    .withIndex('by_auth_id', (q: any) => q.eq('authId', auth.subject))
    .first()
  if (!user?.workspaceId) return null

  const membership = await ctx.db
    .query('memberships')
    .withIndex('by_user_workspace', (q: any) =>
      q.eq('userId', user.authId).eq('workspaceId', user.workspaceId!),
    )
    .first()
  if (!membership) return null

  return {
    kind: 'user',
    userId: user.authId,
    role: membership.role,
    tenantId: user.workspaceId,
  }
}
