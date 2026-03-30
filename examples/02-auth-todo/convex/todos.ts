import { v } from 'convex/values'

import {
  authedMutation,
  authedQuery,
} from './functions'
import { createTodo } from '../shared/schemas/todo'

export const list = authedQuery({
  args: {},
  handler: async ({ db, actor }) => {
    // `db` is raw here because this app is user-scoped, not organization-scoped.
    // The handler enforces ownership by filtering with the guaranteed actor.
    return await db
      .query('todos')
      .withIndex('by_user', q => q.eq('userId', actor.userId))
      .order('desc')
      .collect()
  },
})

export const create = authedMutation({
  args: createTodo.validators,
  handler: async ({ db, actor }, args) => {
    // Ownership is explicit in the inserted row.
    return await db.insert('todos', {
      userId: actor.userId,
      title: args.title,
      completed: false,
      createdAt: Date.now(),
    })
  },
})

export const toggle = authedMutation({
  args: { id: v.id('todos') },
  handler: async ({ db, actor }, args) => {
    const todo = await db.get(args.id)
    if (!todo) throw new Error('Todo not found.')
    if (todo.userId !== actor.userId) throw new Error('Forbidden.')

    await db.patch(args.id, {
      completed: !todo.completed,
    })
  },
})

export const remove = authedMutation({
  args: { id: v.id('todos') },
  handler: async ({ db, actor }, args) => {
    const todo = await db.get(args.id)
    if (!todo) throw new Error('Todo not found.')
    if (todo.userId !== actor.userId) throw new Error('Forbidden.')

    await db.delete(args.id)
  },
})
