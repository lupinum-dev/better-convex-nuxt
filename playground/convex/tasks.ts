import { v } from 'convex/values'
import { query, mutation } from './_generated/server'
import { addTaskInputSchema } from '../shared/schemas/task.schema'
// In your project, import from 'better-convex-nuxt/zod'
// Using relative import here for playground development
import { validateZodInput } from '../../src/runtime/utils/zod'

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

// Add a new task with Zod validation
export const add = mutation({
  args: { input: v.any() }, // Accept any input, validate with Zod
  handler: async (ctx, args) => {
    // Single-line validation with full type inference!
    const validated = validateZodInput(args.input, addTaskInputSchema)

    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error('Not authenticated')
    }

    const taskId = await ctx.db.insert('tasks', {
      userId: identity.subject,
      title: validated.title, // Fully typed!
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
