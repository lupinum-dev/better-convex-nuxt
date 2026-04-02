import { can, enforce, ensureTenant, requireRecord, withCan } from 'better-convex-nuxt/auth'

import { createTodo, deleteTodo, listTodos, setTodoCompleted } from '../shared/schemas/todo'
import { canCreateTodo, canDeleteTodo, canReadTodo, canUpdateTodo } from './auth/checks'
import { appMutation, appQuery } from './functions'

export const list = appQuery({
  args: listTodos.args,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
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
  },
})

export const get = appQuery({
  args: deleteTodo.args,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    enforce(actor, 'Read todos', canReadTodo)

    const todo = await ctx.db.get(args.id)
    requireRecord(todo, 'Todo')
    ensureTenant(actor, todo)
    return withCan(todo, {
      update: can(actor, canUpdateTodo(todo)),
      delete: can(actor, canDeleteTodo(todo)),
    })
  },
})

export const create = appMutation({
  args: createTodo.args,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    enforce(actor, 'Create todo', canCreateTodo)

    return ctx.db.insert('todos', {
      title: args.title,
      completed: false,
      ownerId: actor.userId,
      workspaceId: actor.tenantId,
      createdAt: Date.now(),
    })
  },
})

export const setCompleted = appMutation({
  args: setTodoCompleted.args,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    const todo = await ctx.db.get(args.id)
    requireRecord(todo, 'Todo')
    ensureTenant(actor, todo)
    enforce(actor, 'Update todo', canUpdateTodo(todo))

    await ctx.db.patch(args.id, {
      completed: args.completed,
    })
  },
})

export const remove = appMutation({
  args: deleteTodo.args,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    const todo = await ctx.db.get(args.id)
    requireRecord(todo, 'Todo')
    ensureTenant(actor, todo)
    enforce(actor, 'Delete todo', canDeleteTodo(todo))
    await ctx.db.delete(args.id)
  },
})
