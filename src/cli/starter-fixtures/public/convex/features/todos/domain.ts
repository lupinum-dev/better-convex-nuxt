import { requireRecord } from '@lupinum/trellis/auth'
import { v } from 'convex/values'

import { createTodo } from '../../../shared/features/todos/contract'
import { mutation, query } from '../../functions'

export const list = query.public({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('todos').order('desc').collect()
  },
})

export const create = mutation.public({
  args: createTodo.args,
  handler: async (ctx, args) => {
    return await ctx.db.insert('todos', {
      title: args.title,
      completed: false,
      createdAt: Date.now(),
    })
  },
})

export const toggle = mutation.public({
  args: { id: v.id('todos') },
  load: async (ctx, args) => {
    const todo = await ctx.db.get(args.id)
    requireRecord(todo, 'Todo')
    return { todo }
  },
  handler: async (ctx, args, { todo }) => {
    await ctx.db.patch(args.id, {
      completed: !todo.completed,
    })
  },
})

export const remove = mutation.public({
  args: { id: v.id('todos') },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id)
  },
})
