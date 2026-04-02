import { enforce } from '@lupinum/trellis/auth'
import { v } from 'convex/values'

import { canViewAudit } from './auth/checks'
import { app } from './functions'

export const stats = app.query({
  args: {},
  guard: canViewAudit,
  handler: async (ctx) => {
    const actor = await ctx.actor()

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

export const recentActivity = app.query({
  args: { limit: v.optional(v.number()) },
  guard: canViewAudit,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()

    const events = await ctx.db
      .query('auditEvents')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', actor.tenantId))
      .order('desc')
      .collect()

    return events.slice(0, args.limit ?? 20)
  },
})
