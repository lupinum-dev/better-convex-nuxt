import { definePermissionContext } from '@lupinum/trellis/auth'

import { getActor } from '../auth/actor'
import { getMemberships } from '../auth/agency'
import { agencyPermissions } from '../auth/permissions'
import { query } from '../functions'

export const getPermissionContext = query(
  definePermissionContext({
    resolve: getActor,
    permissions: agencyPermissions,
    extend: async (ctx, actor) => {
      const user = await ctx.db
        .query('users')
        .withIndex('by_auth_id', (q: any) => q.eq('authId', actor.userId))
        .first()

      const crossTenant = (ctx.db as typeof ctx.db & { crossTenant: typeof ctx.db }).crossTenant
      const memberships = await getMemberships(crossTenant, actor.userId)

      return {
        email: user?.email ?? null,
        displayName: user?.displayName ?? null,
        agencyDashboard: memberships.some((membership) =>
          ['agency_admin', 'agency_manager'].includes(membership.role),
        ),
      }
    },
  }),
)
