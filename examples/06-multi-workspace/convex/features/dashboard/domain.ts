import { deny } from '@lupinum/trellis/auth'

import { listAgencyPortfolio } from '../../../shared/features/dashboard/contract'
import type { Doc } from '../../_generated/dataModel'
import { getActor } from '../../auth/actor'
import { getAgencyActor, getMemberships, requireAnyAgencyRole } from '../../auth/agency'
import { query } from '../../functions'

function escapeTenantIsolation<TDb extends object>(db: TDb, reason: string): TDb {
  return (
    db as TDb & { escapeTenantIsolation: (options: { reason: string }) => TDb }
  ).escapeTenantIsolation({
    reason,
  })
}

export const portfolio = query.unsafe({
  bypass: 'Show the agency portfolio across assigned workspaces.',
  args: listAgencyPortfolio.args,
  handler: async (ctx) => {
    const actor = await getAgencyActor(ctx)
    if (!actor) throw deny('Not authenticated.')

    const scopedActor = await getActor(ctx)
    if (!scopedActor) throw deny('Not authenticated.')

    // Cross-tenant by design, but still membership-bounded: the portfolio only spans workspaces
    // where this actor already has an agency role.
    const db = escapeTenantIsolation(
      ctx.db,
      'Agency portfolio intentionally spans multiple workspaces.',
    )

    await requireAnyAgencyRole(db, actor.userId, 'agency_admin', 'agency_manager')

    const memberships = await getMemberships(db, actor.userId)
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
