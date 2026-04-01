/// <reference types="vite/client" />

import { createTestContext } from 'better-convex-nuxt/testing'
import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import schema from './schema'
import { modules } from './test.setup'

const api = anyApi

function createCtx() {
  return createTestContext({ schema, modules })
}

describe('auth todo example', () => {
  it('keeps todos user-scoped', async () => {
    const ctx = createCtx()
    await ctx.seed('users', {
      authId: 'alice',
      email: 'alice@example.test',
      displayName: 'Alice',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    await ctx.seed('users', {
      authId: 'bob',
      email: 'bob@example.test',
      displayName: 'Bob',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    const alice = ctx.raw.withIdentity({
      subject: 'alice',
      email: 'alice@example.test',
      name: 'Alice',
    })
    const bob = ctx.raw.withIdentity({
      subject: 'bob',
      email: 'bob@example.test',
      name: 'Bob',
    })

    const todoId = await alice.mutation(api.todos.create, {
      title: 'Alice todo',
    })

    await expect(bob.mutation(api.todos.toggle, { id: todoId })).rejects.toThrow('Todo not found.')

    const aliceTodos = await alice.query(api.todos.list, {})
    const bobTodos = await bob.query(api.todos.list, {})

    expect(aliceTodos).toHaveLength(1)
    expect(aliceTodos[0]?.title).toBe('Alice todo')
    expect(bobTodos).toHaveLength(0)
  })
})
