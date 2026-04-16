import { open, requireRecord } from '@lupinum/trellis/auth'
import { defineTrellis } from '@lupinum/trellis/functions'
import { v } from 'convex/values'

import { createTodo } from '../shared/schemas/todo'
import { mutation as generatedMutation, query as generatedQuery } from './_generated/server'

const { mutation, query } = defineTrellis({
  query: generatedQuery,
  mutation: generatedMutation,
})

export const list = query({
  args: {},
  guard: open,
  handler: async (ctx) => {
    return await ctx.db.query('todos').order('desc').collect()
  },
})

export const create = mutation({
  args: createTodo.args,
  guard: open,
  handler: async (ctx, args) => {
    return await ctx.db.insert('todos', {
      title: args.title,
      completed: false,
      createdAt: Date.now(),
    })
  },
})

export const toggle = mutation({
  args: { id: v.id('todos') },
  guard: open,
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

export const remove = mutation({
  args: { id: v.id('todos') },
  guard: open,
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id)
  },
})
