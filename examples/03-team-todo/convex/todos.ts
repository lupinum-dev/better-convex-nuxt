import { mutation, query } from './_generated/server'

import { can, guard } from 'better-convex-nuxt/auth'

import {
  canCreateTodo,
  canDeleteTodo,
  canReadTodo,
  canUpdateTodo,
} from './auth/checks'
import { getActor } from './auth/actor'
import { withCan } from './auth/resource'
import { ensureFound, ensureTenant } from './auth/scope'
import {
  createTodo,
  deleteTodo,
  setTodoCompleted,
} from '../shared/schemas/todo'

export const list = query({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    guard(actor, 'Read todos', canReadTodo)

    const todos = await ctx.db.query('todos')
      .withIndex('by_organization', q => q.eq('organizationId', actor!.tenantId))
      .order('desc')
      .collect()

    return todos.map(todo => withCan(todo, {
      update: can(actor, canUpdateTodo(todo)),
      delete: can(actor, canDeleteTodo(todo)),
    }))
  },
})

export const get = query({
  args: deleteTodo.validators,
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    guard(actor, 'Read todos', canReadTodo)

    const todo = await ctx.db.get(args.id)
    ensureFound(todo, 'Todo')
    ensureTenant(actor, todo)
    return withCan(todo, {
      update: can(actor, canUpdateTodo(todo)),
      delete: can(actor, canDeleteTodo(todo)),
    })
  },
})

export const create = mutation({
  args: createTodo.validators,
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    guard(actor, 'Create todo', canCreateTodo)

    return ctx.db.insert('todos', {
      title: args.title,
      completed: false,
      ownerId: actor!.userId,
      organizationId: actor!.tenantId,
      createdAt: Date.now(),
    })
  },
})

export const setCompleted = mutation({
  args: setTodoCompleted.validators,
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    const todo = await ctx.db.get(args.id)
    ensureFound(todo, 'Todo')
    ensureTenant(actor, todo)
    guard(actor, 'Update todo', canUpdateTodo(todo))

    await ctx.db.patch(args.id, {
      completed: args.completed,
    })
  },
})

export const remove = mutation({
  args: deleteTodo.validators,
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    const todo = await ctx.db.get(args.id)
    ensureFound(todo, 'Todo')
    ensureTenant(actor, todo)
    guard(actor, 'Delete todo', canDeleteTodo(todo))
    await ctx.db.delete(args.id)
  },
})
