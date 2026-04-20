import { listMembers as listMembersArgs } from '../../../shared/features/memberships/contract'
import { query } from '../../functions'
import { membershipRead } from './permissions'

export const listMembers = query({
  args: listMembersArgs.args,
  guard: membershipRead,
  handler: async (ctx) => {
    const actor = await ctx.actor()
    if (!actor) throw new Error('Current actor is not assigned to a workspace.')

    const memberships = await ctx.db
      .query('memberships')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', actor.tenantId))
      .collect()

    return Promise.all(
      memberships.map(async (membership) => {
        const user = await ctx.db
          .query('users')
          .withIndex('by_auth_id', (q) => q.eq('authId', membership.userId))
          .first()

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
