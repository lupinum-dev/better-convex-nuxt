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
const toggleTodo = makeFunctionReference<'mutation', { id: Id<'todos'> }, null>('todos:toggle')
const removeTodo = makeFunctionReference<'mutation', { id: Id<'todos'> }, null>('todos:remove')

describe('public todos', () => {
  it('rejects empty text', async () => {
    const t = convexTest(schema, modules)

    await expect(t.mutation(createTodo, { text: '   ' })).rejects.toThrow(
      'Todo text must be between 1 and 200 characters',
    )
    await expect(t.mutation(createTodo, { text: 'x'.repeat(201) })).rejects.toThrow(
      'Todo text must be between 1 and 200 characters',
    )
  })

  it('keeps shared todo writes anonymous by design and validates object existence', async () => {
    const t = convexTest(schema, modules)

    // This starter intentionally has no users or owners. Cross-user denial is
    // N/A; anonymous callers share one bounded public todo collection.
    const todoId = await t.mutation(createTodo, { text: '  public todo  ' })
    await t.mutation(toggleTodo, { id: todoId })
    expect(await t.query(listTodos, {})).toMatchObject([
      { _id: todoId, text: 'public todo', completed: true },
    ])

    await t.mutation(removeTodo, { id: todoId })
    expect(await t.query(listTodos, {})).toEqual([])
    await expect(t.mutation(toggleTodo, { id: todoId })).rejects.toThrow('Todo not found')
    await expect(t.mutation(removeTodo, { id: todoId })).rejects.toThrow('Todo not found')
  })

  it('lists newest todos first', async () => {
    const t = convexTest(schema, modules)

    await t.run(async (ctx) => {
      await ctx.db.insert('todos', {
        text: 'first',
        completed: false,
        createdAt: 1,
      })
      await ctx.db.insert('todos', {
        text: 'second',
        completed: false,
        createdAt: 2,
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
