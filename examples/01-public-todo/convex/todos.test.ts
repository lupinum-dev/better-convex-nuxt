/// <reference types="vite/client" />

import { createTestContext } from '@lupinum/trellis/testing'
import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import schema from './schema'
import { modules } from './test.setup'

const api = anyApi

function createCtx() {
  return createTestContext({ schema, modules })
}

describe('public todo example', () => {
  it('creates, toggles, lists, and removes todos', async () => {
    const ctx = createCtx()

    const firstId = await ctx.raw.mutation(api.todos.create, {
      title: 'Ship public demo',
    })
    const secondId = await ctx.raw.mutation(api.todos.create, {
      title: 'Write docs',
    })

    let todos = await ctx.raw.query(api.todos.list, {})
    expect(todos).toHaveLength(2)
    expect(todos[0]?.title).toBe('Write docs')
    expect(todos[1]?.title).toBe('Ship public demo')

    await ctx.raw.mutation(api.todos.toggle, { id: firstId })

    todos = await ctx.raw.query(api.todos.list, {})
    expect(todos.find((todo) => todo._id === firstId)?.completed).toBe(true)

    await ctx.raw.mutation(api.todos.remove, { id: secondId })

    todos = await ctx.raw.query(api.todos.list, {})
    expect(todos).toHaveLength(1)
    expect(todos[0]?._id).toBe(firstId)
  })
})
