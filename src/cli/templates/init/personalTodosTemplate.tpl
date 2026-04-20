import { v } from 'convex/values'

import { deny } from '@lupinum/trellis/auth'
import { createTodo } from '../../shared/features/todos/contract'
import { isAuthenticated } from '../auth/guards'
import { mutation, query } from '../functions'

export const list = query({
  args: {},
  guard: isAuthenticated,
  handler: async (ctx) => {
    const actor = await ctx.actor()

    return await ctx.db
      .query('todos')
      .withIndex('by_owner', (q) => q.eq('ownerId', actor.userId))
      .order('desc')
      .collect()
  },
})

export const create = mutation({
  args: createTodo.args,
  guard: isAuthenticated,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()

    return await ctx.db.insert('todos', {
      ownerId: actor.userId,
      title: args.title,
      completed: false,
      createdAt: Date.now(),
    })
  },
})

export const toggle = mutation({
  args: { id: v.id('todos') },
  guard: isAuthenticated,
  load: async (ctx, args) => {
    const actor = await ctx.actor()
    const todo = await ctx.db.get(args.id)

    if (!todo || todo.ownerId !== actor.userId) {
      throw deny('Todo not found.')
    }

    return { todo }
  },
  handler: async (ctx, args, { todo }) => {
    await ctx.db.patch(args.id, {
      completed: !todo.completed,
    })
  },
})
