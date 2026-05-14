import { deny } from '@lupinum/trellis/auth'
import { unsafe as unsafePermit } from '@lupinum/trellis/backend'

import { listAgencyPortfolio } from '../../../shared/features/dashboard/contract'
import type { Doc } from '../../_generated/dataModel'
import { getAgencyActor, getMemberships, requireAnyAgencyRole } from '../../auth/agency'
import { getAppIdentity } from '../../auth/appIdentity'
import { query } from '../../functions'

function escapeIsolation<TDb extends object>(db: TDb, reason: string): TDb {
  return (db as TDb & { escapeIsolation: (options: { reason: string }) => TDb }).escapeIsolation({
    reason,
  })
}

export const portfolio = query.unsafe({
  permit: unsafePermit.permit({
    kind: 'agencyPortfolio',
    reason: 'Show the agency portfolio across assigned workspaces.',
    scope: ['dashboard', 'workspaces'],
  }),
  args: listAgencyPortfolio.args,
  handler: async (ctx) => {
    const appIdentity = await getAgencyActor(ctx)
    if (!appIdentity) throw deny('Not authenticated.')

    const scopedActor = await getAppIdentity(ctx)
    if (!scopedActor) throw deny('Not authenticated.')

    // Cross-scope by design, but still membership-bounded: the portfolio only spans workspaces
    // where this appIdentity already has an agency role.
    const db = escapeIsolation(ctx.db, 'Agency portfolio intentionally spans multiple workspaces.')

    await requireAnyAgencyRole(db, appIdentity.userId, 'agency_admin', 'agency_manager')

    const memberships = await getMemberships(db, appIdentity.userId)
    const agencyMemberships = memberships.filter((membership) =>
      ['agency_admin', 'agency_manager'].includes(membership.role),
    )

    return Promise.all(
      agencyMemberships.map(async (membership) => {
        const workspace = await db.get(membership.workspaceId)
        const projects = await db
          .query('projects')
          .withIndex('by_workspace', (q: any) => q.eq('workspaceId', membership.workspaceId))
          .collect()

        return {
          workspace: {
            id: membership.workspaceId,
            name: workspace?.name ?? String(membership.workspaceId),
          },
          role: membership.role,
          activeProjects: projects.filter((project: Doc<'projects'>) => project.status === 'active')
            .length,
          totalProjects: projects.length,
        }
      }),
    )
  },
})
