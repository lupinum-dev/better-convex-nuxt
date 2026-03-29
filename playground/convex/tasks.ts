import { v } from 'convex/values'

import { query, mutation } from './_generated/server'
import { resolveActor, serviceAuthArgs, tryResolveActor } from './lib/actor'

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
  args: { ...serviceAuthArgs },
  handler: async (ctx, args) => {
    const actor = await tryResolveActor(ctx, args)
    if (!actor) {
      return []
    }

    const tasks = await ctx.db
      .query('tasks')
      .withIndex('by_user', (q) => q.eq('userId', actor.userId))
      .order('desc')
      .collect()

    return tasks
  },
})

// Add a new task
export const add = mutation({
  args: { title: v.string(), ...serviceAuthArgs },
  handler: async (ctx, args) => {
    const actor = await resolveActor(ctx, args)

    const taskId = await ctx.db.insert('tasks', {
      userId: actor.userId,
      title: args.title,
      completed: false,
      createdAt: Date.now(),
    })

    return taskId
  },
})

// Toggle task completion
export const toggle = mutation({
  args: { id: v.id('tasks'), ...serviceAuthArgs },
  handler: async (ctx, args) => {
    const actor = await resolveActor(ctx, args)

    const task = await ctx.db.get(args.id)
    if (!task) {
      throw new Error('Task not found')
    }

    // Ensure user owns the task
    if (task.userId !== actor.userId) {
      throw new Error('Not authorized')
    }

    await ctx.db.patch(args.id, {
      completed: !task.completed,
    })
  },
})

// Delete a task
export const remove = mutation({
  args: { id: v.id('tasks'), ...serviceAuthArgs },
  handler: async (ctx, args) => {
    const actor = await resolveActor(ctx, args)

    const task = await ctx.db.get(args.id)
    if (!task) {
      throw new Error('Task not found')
    }

    // Ensure user owns the task
    if (task.userId !== actor.userId) {
      throw new Error('Not authorized')
    }

    await ctx.db.delete(args.id)
  },
})
