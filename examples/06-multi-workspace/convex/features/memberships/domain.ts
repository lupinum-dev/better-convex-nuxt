import { listMembers as listMembersArgs } from '../../../shared/features/memberships/contract'
import { query } from '../../functions'
import { membershipRead } from './permissions'

export const listMembers = query.protected({
  args: listMembersArgs.args,
  guard: membershipRead,
  handler: async (ctx) => {
    const appIdentity = await ctx.appIdentity()
    if (!appIdentity) throw new Error('Current appIdentity is not assigned to a workspace.')

    const memberships = await ctx.db
      .query('memberships')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', appIdentity.workspaceId))
      .collect()

    return Promise.all(
      memberships.map(async (membership) => {
        const user = await ctx.db.get(membership.userId)

        return {
          _id: membership._id,
          userId: membership.userId,
          role: membership.role,
          displayName: user?.displayName ?? null,
          email: user?.email ?? null,
        }
      }),
    )
  },
})
