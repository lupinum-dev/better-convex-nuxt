import { enforce } from '@lupinum/trellis/auth'
import { v } from 'convex/values'

import { requireWorkspaceTenant } from '../auth/checks'
import { workspaceAudit } from '../auth/permissions'
import { mutation, query } from '../functions'

export const stats = query({
  args: {},
  guard: workspaceAudit,
  handler: async (ctx) => {
    const actor = await ctx.actor()
    const workspaceId = requireWorkspaceTenant(actor)

    const [projects, tasks] = await Promise.all([
      ctx.db
        .query('projects')
        .withIndex('by_workspace', (q) => q.eq('workspaceId', workspaceId))
        .collect(),
      ctx.db
        .query('tasks')
        .withIndex('by_workspace', (q) => q.eq('workspaceId', workspaceId))
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
  guard: workspaceAudit,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    const workspaceId = requireWorkspaceTenant(actor)

    const events = await ctx.db
      .query('auditEvents')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', workspaceId))
      .order('desc')
      .collect()

    return events.slice(0, args.limit ?? 20)
  },
})
