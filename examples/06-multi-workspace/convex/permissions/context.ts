import { defineAccessContext } from '@lupinum/trellis/auth'

import { getMemberships } from '../auth/agency'
import { getAppIdentity } from '../auth/appIdentity'
import { permissions } from '../features'
import { query } from '../functions'

export const getAccessContext = query.protected(
  defineAccessContext({
    resolve: getAppIdentity,
    permissions,
    extend: async (ctx, appIdentity) => {
      const user = await ctx.db
        .query('users')
        .withIndex('by_auth_id', (q: any) => q.eq('authId', appIdentity.userId))
        .first()

      const memberships = await getMemberships(
        ctx.db.escapeIsolation({
          reason: 'Agency dashboard context aggregates memberships across workspaces.',
        }),
        appIdentity.userId,
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
