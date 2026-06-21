import { ConvexError } from 'convex/values'

import type { Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { requireCurrentUser } from './users'

type Role = 'owner' | 'admin' | 'reviewer' | 'viewer'

const roleRank: Record<Role, number> = {
  owner: 4,
  admin: 3,
  reviewer: 2,
  viewer: 1
}

export async function requireOrgAccess(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<'organizations'>,
  minimumRole: Role = 'viewer'
) {
  const user = await requireCurrentUser(ctx)
  const membership = await ctx.db
    .query('memberships')
    .withIndex('by_org_user', (q: any) =>
      q.eq('organizationId', organizationId).eq('userId', user._id)
    )
    .unique()

  if (!membership || membership.status !== 'active') {
    throw new ConvexError('Organization access denied')
  }

  if (roleRank[membership.role as Role] < roleRank[minimumRole]) {
    throw new ConvexError('Insufficient role')
  }

  return { user, membership }
}
