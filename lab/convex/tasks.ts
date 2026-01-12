/**
 * Tasks Functions - Optimistic updates demo
 *
 * Demonstrates optimistic updates with useConvexMutation.
 */

import { v } from 'convex/values'
import { mutation, query } from './_generated/server'

/**
 * List all tasks, sorted by creation time (newest first)
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const tasks = await ctx.db
      .query('demoTasks')
      .order('desc')
      .take(100)

    return tasks
  }
})

/**
 * Add a new task
 */
export const add = mutation({
  args: {
    title: v.string()
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error('Not authenticated')
    }

    // Add a small delay to make the difference between standard and optimistic more visible
    await new Promise((resolve) => setTimeout(resolve, 500))

    const taskId = await ctx.db.insert('demoTasks', {
      title: args.title,
      completed: false,
      userId: identity.subject,
      createdAt: Date.now()
    })

    return taskId
  }
})

/**
 * Toggle task completion
 */
export const toggle = mutation({
  args: {
    id: v.id('demoTasks')
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error('Not authenticated')
    }

    const task = await ctx.db.get(args.id)
    if (!task) {
      throw new Error('Task not found')
    }

    // Add a small delay
    await new Promise((resolve) => setTimeout(resolve, 300))

    await ctx.db.patch(args.id, {
      completed: !task.completed
    })
  }
})

/**
 * Remove a task
 */
export const remove = mutation({
  args: {
    id: v.id('demoTasks')
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error('Not authenticated')
    }

    const task = await ctx.db.get(args.id)
    if (!task) {
      throw new Error('Task not found')
    }

    // Add a small delay
    await new Promise((resolve) => setTimeout(resolve, 300))

    await ctx.db.delete(args.id)
  }
})

/**
 * Clear all tasks (for demo reset)
 */
export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error('Not authenticated')
    }

    const tasks = await ctx.db.query('demoTasks').collect()

    for (const task of tasks) {
      await ctx.db.delete(task._id)
    }

    return { deleted: tasks.length }
  }
})
