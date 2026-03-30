import { v } from 'convex/values'

import {
  authedMutation,
  authedQuery,
} from './functions'
import { createTodo } from '../shared/schemas/todo'

export const list = authedQuery({
  args: {},
  handler: async ({ db, actor }) => {
    // `db` is raw here because this app is user-scoped, not tenant-scoped.
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
  // `resource` + `ownerField` lets auth-only apps use the same ownership pipeline
  // as tenant-scoped apps, without introducing a permission config.
  resource: args => args.id,
  ownerField: 'userId',
  handler: async ({ db, resource }, args) => {
    await db.patch(args.id, {
      completed: !resource!.completed,
    })
  },
})

export const remove = authedMutation({
  args: { id: v.id('todos') },
  // Same ownership pipeline as `toggle`, but the handler itself stays tiny.
  resource: args => args.id,
  ownerField: 'userId',
  handler: async ({ db }, args) => {
    await db.delete(args.id)
  },
})
