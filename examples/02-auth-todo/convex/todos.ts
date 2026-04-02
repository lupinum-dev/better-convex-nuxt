import { requireRecord } from '@lupinum/trellis/auth'
import { v } from 'convex/values'

import { createTodo } from '../shared/schemas/todo'
import { isAuthenticated } from './auth/checks'
import { app } from './functions'

export const list = app.query({
  args: {},
  guard: isAuthenticated,
  handler: async (ctx) => {
    const actor = await ctx.actor()

    // `db` is raw here because this app is user-scoped, not tenant-scoped.
    // The handler enforces ownership by filtering with the guaranteed actor.
    return await ctx.db
      .query('todos')
      .withIndex('by_owner', (q) => q.eq('ownerId', actor.userId))
      .order('desc')
      .collect()
  },
})

export const create = app.mutation({
  args: createTodo.args,
  guard: isAuthenticated,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()

    // Ownership is explicit in the inserted row.
    return await ctx.db.insert('todos', {
      ownerId: actor.userId,
      title: args.title,
      completed: false,
      createdAt: Date.now(),
    })
  },
})

export const toggle = app.mutation({
  args: { id: v.id('todos') },
  guard: isAuthenticated,
  load: async (ctx, args) => {
    const todo = await ctx.db.get(args.id)
    requireRecord(todo, 'Todo')
    return { todo }
  },
  authorize: {
    label: 'Update todo',
    check: (actor, { todo }) => !!actor && actor.userId === todo.ownerId,
  },
  handler: async (ctx, args, { todo }) => {
    await ctx.db.patch(args.id, {
      completed: !todo.completed,
    })
  },
})

export const remove = app.mutation({
  args: { id: v.id('todos') },
  guard: isAuthenticated,
  load: async (ctx, args) => {
    const todo = await ctx.db.get(args.id)
    requireRecord(todo, 'Todo')
    return { todo }
  },
  authorize: {
    label: 'Delete todo',
    check: (actor, { todo }) => !!actor && actor.userId === todo.ownerId,
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id)
  },
})
