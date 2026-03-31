import { can, authorize } from 'better-convex-nuxt/auth'

import { createTodo, deleteTodo, setTodoCompleted } from '../shared/schemas/todo'
import { mutation, query } from './_generated/server'
import { getActor } from './auth/actor'
import { canCreateTodo, canDeleteTodo, canReadTodo, canUpdateTodo } from './auth/checks'
import { withCan } from './auth/resource'
import { requireRecord, ensureTenant } from './auth/scope'

export const list = query({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    authorize(actor, 'Read todos', canReadTodo)

    const todos = await ctx.db
      .query('todos')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', actor.tenantId))
      .order('desc')
      .collect()

    return todos.map((todo) =>
      withCan(todo, {
        update: can(actor, canUpdateTodo(todo)),
        delete: can(actor, canDeleteTodo(todo)),
      }),
    )
  },
})

export const get = query({
  args: deleteTodo.fullArgs,
  handler: async (ctx, args) => {
    const actor = await getActor(ctx, args)
    authorize(actor, 'Read todos', canReadTodo)

    const todo = await ctx.db.get(args.id)
    requireRecord(todo, 'Todo')
    ensureTenant(actor, todo)
    return withCan(todo, {
      update: can(actor, canUpdateTodo(todo)),
      delete: can(actor, canDeleteTodo(todo)),
    })
  },
})

export const create = mutation({
  args: createTodo.fullArgs,
  handler: async (ctx, args) => {
    const actor = await getActor(ctx, args)
    authorize(actor, 'Create todo', canCreateTodo)

    return ctx.db.insert('todos', {
      title: args.title,
      completed: false,
      ownerId: actor.userId,
      workspaceId: actor.tenantId,
      createdAt: Date.now(),
    })
  },
})

export const setCompleted = mutation({
  args: setTodoCompleted.fullArgs,
  handler: async (ctx, args) => {
    const actor = await getActor(ctx, args)
    const todo = await ctx.db.get(args.id)
    requireRecord(todo, 'Todo')
    ensureTenant(actor, todo)
    authorize(actor, 'Update todo', canUpdateTodo(todo))

    await ctx.db.patch(args.id, {
      completed: args.completed,
    })
  },
})

export const remove = mutation({
  args: deleteTodo.fullArgs,
  handler: async (ctx, args) => {
    const actor = await getActor(ctx, args)
    const todo = await ctx.db.get(args.id)
    requireRecord(todo, 'Todo')
    ensureTenant(actor, todo)
    authorize(actor, 'Delete todo', canDeleteTodo(todo))
    await ctx.db.delete(args.id)
  },
})
