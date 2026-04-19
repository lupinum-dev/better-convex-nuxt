import { can, definePermissionContext } from '@lupinum/trellis/auth'

import { agencyPermissionKeys, type AgencyPermissionMap } from '../../shared/permissions'
import { getActor } from '../auth/actor'
import { getMemberships } from '../auth/agency'
import { hasRole } from '../auth/checks'
import { query } from '../functions'

type Actor = NonNullable<Awaited<ReturnType<typeof getActor>>>

export const getPermissionContext = query(
  definePermissionContext({
    resolve: getActor,
    guards: {
      [agencyPermissionKeys.projectCreate]: hasRole('owner', 'member'),
      [agencyPermissionKeys.agencyDashboard]: (actor: Actor) =>
        ['agency_admin', 'agency_manager'].includes(actor.role),
    } satisfies Record<keyof AgencyPermissionMap, (actor: Actor) => boolean>,
    extend: async (ctx, actor) => {
      const crossTenant = (ctx.db as typeof ctx.db & { crossTenant: typeof ctx.db }).crossTenant
      const user = await ctx.db
        .query('users')
        .withIndex('by_auth_id', (q: any) => q.eq('authId', actor.userId))
        .first()
      const memberships = await getMemberships(crossTenant, actor.userId)

      return {
        email: user?.email ?? null,
        displayName: user?.displayName ?? null,
        can: {
          [agencyPermissionKeys.projectCreate]: can(actor, hasRole('owner', 'member')),
          [agencyPermissionKeys.agencyDashboard]: memberships.some((m) =>
            ['agency_admin', 'agency_manager'].includes(m.role),
          ),
        } satisfies AgencyPermissionMap,
      }
    },
  }),
)
