import { v } from 'convex/values'

import {
  publicMutation,
  publicQuery,
} from './functions'
import { createTodo } from '../shared/schemas/todo'

export const list = publicQuery({
  args: {},
  handler: async ({ db }) => {
    // `db` is the raw Convex database here because this app has no auth or tenant rules.
    return await db.query('todos').order('desc').collect()
  },
})

export const create = publicMutation({
  args: createTodo.validators,
  handler: async ({ db }, args) => {
    // The page passes plain business args, and the handler inserts plain business fields.
    return await db.insert('todos', {
      title: args.title,
      completed: false,
      createdAt: Date.now(),
    })
  },
})

export const toggle = publicMutation({
  args: { id: v.id('todos') },
  handler: async ({ db }, args) => {
    const todo = await db.get(args.id)
    if (!todo) {
      throw new Error('Todo not found.')
    }

    await db.patch(args.id, {
      completed: !todo.completed,
    })
  },
})

export const remove = publicMutation({
  args: { id: v.id('todos') },
  handler: async ({ db }, args) => {
    await db.delete(args.id)
  },
})
