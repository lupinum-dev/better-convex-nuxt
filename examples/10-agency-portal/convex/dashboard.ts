import { deny } from 'better-convex-nuxt/auth'

import { query } from './_generated/server'
import { getAgencyActor, getMemberships, requireAgencyRole } from './auth/agency'

export const portfolio = query({
  args: {},
  handler: async (ctx) => {
    const actor = await getAgencyActor(ctx)
    if (!actor) throw deny('Not authenticated.')

    await requireAgencyRole(ctx.db, actor.userId, 'agency_admin', 'agency_manager')

    const memberships = await getMemberships(ctx.db, actor.userId)
    const clientIds = memberships
      .filter(m => ['agency_admin', 'agency_manager'].includes(m.role))
      .map(m => m.workspaceId)

    return Promise.all(
      clientIds.map(async (workspaceId) => {
        const workspace = await ctx.db.get(workspaceId)
        const projects = await ctx.db
          .query('projects')
          .withIndex('by_workspace', q => q.eq('workspaceId', workspaceId))
          .collect()
        return {
          workspace: {
            id: workspaceId,
            name: workspace?.name ?? workspaceId,
          },
          activeProjects: projects.filter(project => project.status === 'active').length,
        }
      }),
    )
  },
})
