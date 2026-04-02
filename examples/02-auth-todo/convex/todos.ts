import { enforce } from 'better-convex-nuxt/auth'
import { v } from 'convex/values'

import { createTodo } from '../shared/schemas/todo'
import { isAuthenticated } from './auth/checks'
import { loadOwnedResource } from './auth/scope'
import { appMutation, appQuery } from './functions'

export const list = appQuery({
  args: {},
  handler: async (ctx) => {
    const actor = await ctx.actor()
    enforce(actor, 'Read todos', isAuthenticated)

    // `db` is raw here because this app is user-scoped, not tenant-scoped.
    // The handler enforces ownership by filtering with the guaranteed actor.
    return await ctx.db
      .query('todos')
      .withIndex('by_owner', (q) => q.eq('ownerId', actor.userId))
      .order('desc')
      .collect()
  },
})

export const create = appMutation({
  args: createTodo.args,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    enforce(actor, 'Create todo', isAuthenticated)

    // Ownership is explicit in the inserted row.
    return await ctx.db.insert('todos', {
      ownerId: actor.userId,
      title: args.title,
      completed: false,
      createdAt: Date.now(),
    })
  },
})

export const toggle = appMutation({
  args: { id: v.id('todos') },
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    enforce(actor, 'Update todo', isAuthenticated)

    const todo = loadOwnedResource(actor, await ctx.db.get(args.id), 'Todo')

    await ctx.db.patch(args.id, {
      completed: !todo.completed,
    })
  },
})

export const remove = appMutation({
  args: { id: v.id('todos') },
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    enforce(actor, 'Delete todo', isAuthenticated)

    loadOwnedResource(actor, await ctx.db.get(args.id), 'Todo')

    await ctx.db.delete(args.id)
  },
})
