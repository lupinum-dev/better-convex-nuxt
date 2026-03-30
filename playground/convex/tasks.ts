import { v } from 'convex/values'

import {
  authedMutation,
  openQuery,
  publicQuery,
} from './functions'
import { addTask } from '../shared/schemas/task'

export const publicStats = publicQuery({
  args: {},
  handler: async ({ db }) => {
    const totalTasks = await db.query('tasks').collect()
    const completedTasks = totalTasks.filter(task => task.completed)

    return {
      total: totalTasks.length,
      completed: completedTasks.length,
      pending: totalTasks.length - completedTasks.length,
      timestamp: Date.now(),
    }
  },
})

export const list = openQuery({
  args: {},
  handler: async ({ actor, db }) => {
    if (!actor) return []

    return await db
      .query('tasks')
      .withIndex('by_user', q => q.eq('userId', actor.userId))
      .order('desc')
      .collect()
  },
})

export const add = authedMutation({
  args: addTask.validators,
  handler: async ({ db, actor }, args) => {
    return await db.insert('tasks', {
      userId: actor.userId,
      title: args.title,
      completed: false,
      createdAt: Date.now(),
    })
  },
})

export const toggle = authedMutation({
  args: { id: v.id('tasks') },
  handler: async ({ db, actor }, args) => {
    const task = await db.get(args.id)
    if (!task) throw new Error('Task not found')
    if (task.userId !== actor.userId) throw new Error('Not authorized')

    await db.patch(args.id, {
      completed: !task.completed,
    })
  },
})

export const remove = authedMutation({
  args: { id: v.id('tasks') },
  handler: async ({ db, actor }, args) => {
    const task = await db.get(args.id)
    if (!task) throw new Error('Task not found')
    if (task.userId !== actor.userId) throw new Error('Not authorized')

    await db.delete(args.id)
  },
})
