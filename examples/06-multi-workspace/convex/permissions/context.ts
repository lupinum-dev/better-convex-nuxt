import { definePermissionContext } from '@lupinum/trellis/auth'

import { getActor } from '../auth/actor'
import { getMemberships } from '../auth/agency'
import { permissions } from '../features'
import { query } from '../functions'

export const getPermissionContext = query.protected(
  definePermissionContext({
    resolve: getActor,
    permissions,
    extend: async (ctx, actor) => {
      const user = await ctx.db
        .query('users')
        .withIndex('by_auth_id', (q: any) => q.eq('authId', actor.userId))
        .first()

      const memberships = await getMemberships(
        ctx.db.escapeTenantIsolation({
          reason: 'Agency dashboard context aggregates memberships across workspaces.',
        }),
        actor.userId,
      )

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
