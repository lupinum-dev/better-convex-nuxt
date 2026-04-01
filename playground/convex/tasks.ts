import { authorize } from 'better-convex-nuxt/auth'
import { withServiceAuth } from 'better-convex-nuxt/service'
import { mutation, query } from './_generated/server'
import { v } from 'convex/values'

import { addTask, listTasks } from '../shared/schemas/task'
import { getActor } from './auth/actor'
import { isAuthenticated } from './auth/checks'

export const publicStats = query({
  args: {},
  handler: async (ctx) => {
    const totalTasks = await ctx.db.query('tasks').collect()
    const completedTasks = totalTasks.filter(task => task.completed)

    return {
      total: totalTasks.length,
      completed: completedTasks.length,
      pending: totalTasks.length - completedTasks.length,
      timestamp: Date.now(),
    }
  },
})

export const list = query({
  args: withServiceAuth(listTasks.args),
  handler: async (ctx, args) => {
    const actor = await getActor(ctx, args)
    if (!actor) return []

    return await ctx.db
      .query('tasks')
      .withIndex('by_user', q => q.eq('userId', actor.userId))
      .order('desc')
      .collect()
  },
})

export const add = mutation({
  args: withServiceAuth(addTask.args),
  handler: async (ctx, args) => {
    const actor = await getActor(ctx, args)
    authorize(actor, 'Create task', isAuthenticated)

    return await ctx.db.insert('tasks', {
      userId: actor.userId,
      title: args.title,
      completed: false,
      createdAt: Date.now(),
    })
  },
})

export const toggle = mutation({
  args: { id: v.id('tasks') },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    authorize(actor, 'Update task', isAuthenticated)

    const task = await ctx.db.get(args.id)
    if (!task) throw new Error('Task not found')
    if (task.userId !== actor.userId) throw new Error('Not authorized')

    await ctx.db.patch(args.id, {
      completed: !task.completed,
    })
  },
})

export const remove = mutation({
  args: { id: v.id('tasks') },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    authorize(actor, 'Delete task', isAuthenticated)

    const task = await ctx.db.get(args.id)
    if (!task) throw new Error('Task not found')
    if (task.userId !== actor.userId) throw new Error('Not authorized')

    await ctx.db.delete(args.id)
  },
})
