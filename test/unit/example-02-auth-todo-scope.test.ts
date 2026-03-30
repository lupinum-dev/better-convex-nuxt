import { describe, expect, it } from 'vitest'

import {
  ensureFound,
  loadOwnedResource,
} from '../../examples/02-auth-todo/convex/auth/scope'

describe('example 02 auth scope helpers', () => {
  it('throws a not found error for missing docs', () => {
    expect(() => ensureFound(null, 'Todo')).toThrow('Todo not found.')
  })

  it('loads owned docs and hides foreign docs behind not found', () => {
    const actor = { userId: 'alice' }
    const ownTodo = { _id: 'todo-1', userId: 'alice', title: 'Mine' }
    const foreignTodo = { _id: 'todo-2', userId: 'bob', title: 'Not mine' }

    expect(loadOwnedResource(actor, ownTodo, 'Todo')).toEqual(ownTodo)
    expect(() => loadOwnedResource(actor, foreignTodo, 'Todo')).toThrow('Todo not found.')
  })
})
