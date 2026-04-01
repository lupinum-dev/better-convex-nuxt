import { can, enforce, ensureTenant } from 'better-convex-nuxt/auth'
import { withTrustedCaller, withTrustedCallerHandler } from 'better-convex-nuxt/trusted-caller'

import { createTodo, deleteTodo, listTodos, setTodoCompleted } from '../shared/schemas/todo'
import { mutation, query } from './_generated/server'
import { getActor } from './auth/actor'
import { canCreateTodo, canDeleteTodo, canReadTodo, canUpdateTodo } from './auth/checks'
import { withCan } from './auth/resource'
import { requireRecord } from './auth/scope'

export const list = query({
  args: withTrustedCaller(listTodos.args),
  handler: withTrustedCallerHandler(async (ctx, args) => {
    const actor = await getActor(ctx)
    enforce(actor, 'Read todos', canReadTodo)

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
  }),
})

export const get = query({
  args: withTrustedCaller(deleteTodo.args),
  handler: withTrustedCallerHandler(async (ctx, args) => {
    const actor = await getActor(ctx)
    enforce(actor, 'Read todos', canReadTodo)

    const todo = await ctx.db.get(args.id)
    requireRecord(todo, 'Todo')
    ensureTenant(actor, todo)
    return withCan(todo, {
      update: can(actor, canUpdateTodo(todo)),
      delete: can(actor, canDeleteTodo(todo)),
    })
  }),
})

export const create = mutation({
  args: withTrustedCaller(createTodo.args),
  handler: withTrustedCallerHandler(async (ctx, args) => {
    const actor = await getActor(ctx)
    enforce(actor, 'Create todo', canCreateTodo)

    return ctx.db.insert('todos', {
      title: args.title,
      completed: false,
      ownerId: actor.userId,
      workspaceId: actor.tenantId,
      createdAt: Date.now(),
    })
  }),
})

export const setCompleted = mutation({
  args: withTrustedCaller(setTodoCompleted.args),
  handler: withTrustedCallerHandler(async (ctx, args) => {
    const actor = await getActor(ctx)
    const todo = await ctx.db.get(args.id)
    requireRecord(todo, 'Todo')
    ensureTenant(actor, todo)
    enforce(actor, 'Update todo', canUpdateTodo(todo))

    await ctx.db.patch(args.id, {
      completed: args.completed,
    })
  }),
})

export const remove = mutation({
  args: withTrustedCaller(deleteTodo.args),
  handler: withTrustedCallerHandler(async (ctx, args) => {
    const actor = await getActor(ctx)
    const todo = await ctx.db.get(args.id)
    requireRecord(todo, 'Todo')
    ensureTenant(actor, todo)
    enforce(actor, 'Delete todo', canDeleteTodo(todo))
    await ctx.db.delete(args.id)
  }),
})
