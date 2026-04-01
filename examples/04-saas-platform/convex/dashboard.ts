import { authorize } from 'better-convex-nuxt/auth'
import { v } from 'convex/values'

import { query } from './_generated/server'
import { getActor } from './auth/actor'
import { canViewAudit } from './auth/checks'

export const stats = query({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    authorize(actor, 'View audit', canViewAudit)

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

export const recentActivity = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    authorize(actor, 'View audit', canViewAudit)

    const events = await ctx.db
      .query('auditEvents')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', actor.tenantId))
      .order('desc')
      .collect()

    return events.slice(0, args.limit ?? 20)
  },
})
