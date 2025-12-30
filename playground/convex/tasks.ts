import { v } from 'convex/values'

import { query, mutation } from './_generated/server'

// Public stats - no auth required
// Used to test the `public` option in useConvexQuery
export const publicStats = query({
  args: {},
  handler: async (ctx) => {
    // This query doesn't check auth - it's truly public
    const totalTasks = await ctx.db.query('tasks').collect()
    const completedTasks = totalTasks.filter((t) => t.completed)

    return {
      total: totalTasks.length,
      completed: completedTasks.length,
      pending: totalTasks.length - completedTasks.length,
      timestamp: Date.now(),
    }
  },
})

// Get all tasks for the current user
export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      return []
    }

    const userId = identity.subject

    const tasks = await ctx.db
      .query('tasks')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .order('desc')
      .collect()

    return tasks
  },
})

// Add a new task
export const add = mutation({
  args: { title: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error('Not authenticated')
    }

    const userId = identity.subject

    const taskId = await ctx.db.insert('tasks', {
      userId,
      title: args.title,
      completed: false,
      createdAt: Date.now(),
    })

    return taskId
  },
})

// Toggle task completion
export const toggle = mutation({
  args: { id: v.id('tasks') },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error('Not authenticated')
    }

    const task = await ctx.db.get(args.id)
    if (!task) {
      throw new Error('Task not found')
    }

    // Ensure user owns the task
    if (task.userId !== identity.subject) {
      throw new Error('Not authorized')
    }

    await ctx.db.patch(args.id, {
      completed: !task.completed,
    })
  },
})

// Delete a task
export const remove = mutation({
  args: { id: v.id('tasks') },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error('Not authenticated')
    }

    const task = await ctx.db.get(args.id)
    if (!task) {
      throw new Error('Task not found')
    }

    // Ensure user owns the task
    if (task.userId !== identity.subject) {
      throw new Error('Not authorized')
    }

    await ctx.db.delete(args.id)
  },
})
