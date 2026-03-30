/**
 * Why this file exists:
 * This is the core tenant-scoped resource. The handler code is small because the builder pipeline
 * now owns auth resolution, tenant scoping, permission checks, and resource loading.
 */
import {
  scopedMutation,
  scopedQuery,
} from './functions'
import {
  createTodo,
  deleteTodo,
  setTodoCompleted,
} from '../shared/schemas/todo'

export const list = scopedQuery({
  args: {},
  require: 'todo.read',
  handler: async ({ db }) => {
    // In a scoped handler, `db.query('todos')` is already tenant-filtered.
    return await db.query('todos').order('desc').collect()
  },
})

export const get = scopedQuery({
  args: deleteTodo.validators,
  require: 'todo.read',
  handler: async ({ db }, args) => {
    return await db.get(args.id)
  },
})

export const create = scopedMutation({
  args: createTodo.validators,
  require: 'todo.create',
  handler: async ({ db, actor }, args) => {
    return await db.insert('todos', {
      title: args.title,
      completed: false,
      ownerId: actor.userId,
      createdAt: Date.now(),
    })
  },
})

export const setCompleted = scopedMutation({
  args: setTodoCompleted.validators,
  require: 'todo.update',
  // `resource` lets the framework load the todo before the handler, enforce tenant ownership,
  // and in dev it will explain permission denials with actor/rule/resource context.
  resource: args => args.id,
  handler: async ({ db }, args) => {
    await db.patch(args.id, {
      completed: args.completed,
    })
  },
})

export const remove = scopedMutation({
  args: deleteTodo.validators,
  require: 'todo.delete',
  resource: args => args.id,
  handler: async ({ db }, args) => {
    await db.delete(args.id)
  },
})
