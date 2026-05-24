/**
 * Why this file differs from the default tenant-scoped pattern:
 * Agency access resolves authority from `memberships`, not from the user row. The user row only
 * stores the current workspace selection, while `role` comes from the matching membership.
 */
import { getAuth } from '@lupinum/trellis/auth'
import type { GenericActionCtx, GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import type { DataModel, Id } from '../_generated/dataModel'
import type { MembershipRole } from '../features/memberships'

export type AppIdentity = {
  kind: 'user'
  userId: Id<'users'>
  authKey: string
  role: MembershipRole
  workspaceId: Id<'workspaces'>
}

type Ctx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel> | GenericActionCtx<DataModel>

export async function getAppIdentity(ctx: Ctx): Promise<AppIdentity | null> {
  const auth = await getAuth(ctx)
  if (!auth) return null
  if (!('db' in ctx)) {
    throw new Error('Agency appIdentity resolution requires a query or mutation context.')
  }

  const user = await ctx.db
    .query('users')
    .withIndex('by_auth_key', (q: any) => q.eq('authKey', auth.authKey))
    .first()
  if (!user?.workspaceId) return null

  const membership = await ctx.db
    .query('memberships')
    .withIndex('by_user_workspace', (q: any) =>
      q.eq('userId', user._id).eq('workspaceId', user.workspaceId!),
    )
    .first()
  if (!membership) return null

  return {
    kind: 'user',
    userId: user._id,
    authKey: user.authKey,
    role: membership.role,
    workspaceId: user.workspaceId,
  }
}
