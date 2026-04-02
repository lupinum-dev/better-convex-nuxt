import { enforce } from 'better-convex-nuxt/auth'
import { v } from 'convex/values'

import { canViewAudit } from './auth/checks'
import { appQuery } from './functions'

export const stats = appQuery({
  args: {},
  handler: async (ctx) => {
    const actor = await ctx.actor()
    enforce(actor, 'View audit', canViewAudit)

    const [projects, tasks] = await Promise.all([
      ctx.db
        .query('projects')
        .withIndex('by_workspace', (q) => q.eq('workspaceId', actor.tenantId))
        .collect(),
      ctx.db
        .query('tasks')
        .withIndex('by_workspace', (q) => q.eq('workspaceId', actor.tenantId))
        .collect(),
    ])

    return {
      activeProjects: projects.filter((project) => project.status === 'active').length,
      openTasks: tasks.filter((task) => task.status !== 'done').length,
      completedToday: tasks.filter((task) => task.status === 'done').length,
    }
  },
})

export const recentActivity = appQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    enforce(actor, 'View audit', canViewAudit)

    const events = await ctx.db
      .query('auditEvents')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', actor.tenantId))
      .order('desc')
      .collect()

    return events.slice(0, args.limit ?? 20)
  },
})
