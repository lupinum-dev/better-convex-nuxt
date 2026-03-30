/**
 * Why this file exists:
 * The admin page needs several live queries at once. This file demonstrates that scoped queries
 * compose cleanly without the page having to do its own access-control plumbing.
 */
import { v } from 'convex/values'

import { scopedQuery } from './functions'

export const stats = scopedQuery({
  args: {},
  require: 'workspace.audit',
  handler: async ({ db }) => {
    const [projects, tasks] = await Promise.all([
      db.query('projects').collect(),
      db.query('tasks').collect(),
    ])

    return {
      activeProjects: projects.filter(project => project.status === 'active').length,
      openTasks: tasks.filter(task => task.status !== 'done').length,
      completedToday: tasks.filter(task => task.status === 'done').length,
    }
  },
})

export const recentActivity = scopedQuery({
  args: {
    limit: v.optional(v.number()),
  },
  require: 'workspace.audit',
  handler: async ({ db }, args) => {
    const events = await db.query('auditEvents').order('desc').collect()
    return events.slice(0, args.limit ?? 20)
  },
})
