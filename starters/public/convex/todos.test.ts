import { convexTest } from 'convex-test'
import { makeFunctionReference } from 'convex/server'
import type { GenericId as Id } from 'convex/values'
import { describe, expect, it } from 'vitest'

import schema from './schema'
import { modules } from './test.setup'

type Todo = {
  _id: Id<'todos'>
  text: string
  completed: boolean
}

const listTodos = makeFunctionReference<'query', Record<string, never>, Todo[]>('todos:list')
const createTodo = makeFunctionReference<'mutation', { text: string }, Id<'todos'>>('todos:create')

describe('public todos', () => {
  it('rejects empty text', async () => {
    const t = convexTest(schema, modules)

    await expect(t.mutation(createTodo, { text: '   ' })).rejects.toThrow('Todo text is required')
  })

  it('lists newest todos first', async () => {
    const t = convexTest(schema, modules)

    await t.run(async (ctx) => {
      await ctx.db.insert('todos', {
        text: 'first',
        completed: false,
        createdAt: 1
      })
      await ctx.db.insert('todos', {
        text: 'second',
        completed: false,
        createdAt: 2
      })
    })

    const todos = await t.query(listTodos, {})

    expect(todos.map((todo) => todo.text)).toEqual(['second', 'first'])
  })

  it('has no auth or organization backend files', async () => {
    const files = Object.keys(modules)

    expect(files.some((file) => file.includes('/auth.'))).toBe(false)
    expect(files.some((file) => file.includes('/organizations.'))).toBe(false)
    expect(files.some((file) => file.includes('/memberships.'))).toBe(false)
  })
})
