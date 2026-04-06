/**
 * Why this file exists:
 * Cross-client reporting must be explicit. This query is the intentional tenant-bypass path.
 */
import { deny } from '@lupinum/trellis/auth'

import { query } from './_generated/server'
import { getAgencyActor, getMemberships, requireAnyAgencyRole } from './auth/agency'

export const portfolio = query({
  args: {},
  handler: async (ctx) => {
    const actor = await getAgencyActor(ctx)
    if (!actor) throw deny('Not authenticated.')

    await requireAnyAgencyRole(ctx.db, actor.userId, 'agency_admin', 'agency_manager')

    const memberships = await getMemberships(ctx.db, actor.userId)
    const agencyMemberships = memberships.filter((m) =>
      ['agency_admin', 'agency_manager'].includes(m.role),
    )

    return Promise.all(
      agencyMemberships.map(async (membership) => {
        const workspace = await ctx.db.get(membership.workspaceId)
        const projects = await ctx.db
          .query('projects')
          .withIndex('by_workspace', (q) => q.eq('workspaceId', membership.workspaceId))
          .collect()
        return {
          workspace: {
            id: membership.workspaceId,
            name: workspace?.name ?? String(membership.workspaceId),
          },
          role: membership.role,
          activeProjects: projects.filter((project) => project.status === 'active').length,
          totalProjects: projects.length,
        }
      }),
    )
  },
})
