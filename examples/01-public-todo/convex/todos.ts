import { mutation, query } from './_generated/server'
import { v } from 'convex/values'

import { createTodo } from '../shared/schemas/todo'

export const list = query({
  args: {},
  handler: async (ctx) => {
    // `db` is the raw Convex database here because this app has no auth or tenant rules.
    return await ctx.db.query('todos').order('desc').collect()
  },
})

export const create = mutation({
  args: createTodo.args,
  handler: async (ctx, args) => {
    // The page passes plain business args, and the handler inserts plain business fields.
    return await ctx.db.insert('todos', {
      title: args.title,
      completed: false,
      createdAt: Date.now(),
    })
  },
})

export const toggle = mutation({
  args: { id: v.id('todos') },
  handler: async (ctx, args) => {
    const todo = await ctx.db.get(args.id)
    if (!todo) {
      throw new Error('Todo not found.')
    }

    await ctx.db.patch(args.id, {
      completed: !todo.completed,
    })
  },
})

export const remove = mutation({
  args: { id: v.id('todos') },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id)
  },
})
