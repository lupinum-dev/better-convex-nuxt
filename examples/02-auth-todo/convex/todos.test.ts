/// <reference types="vite/client" />

import { createTestContext } from '@lupinum/trellis/testing'
import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import schema from './schema'
import { modules } from './test.setup'

const api = anyApi as any

function createCtx() {
  return createTestContext({ schema, modules })
}

// This example uses manual user seeding because it's auth-only (no tenants).
// For the seedTenant() pattern with named users and workspace isolation, see example 03.
describe('auth todo example', () => {
  it('keeps todos user-scoped', async () => {
    const ctx = createCtx()
    await ctx.seed('users', {
      authKey: 'alice',
      email: 'alice@example.test',
      displayName: 'Alice',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    await ctx.seed('users', {
      authKey: 'bob',
      email: 'bob@example.test',
      displayName: 'Bob',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    const alice = ctx.raw.withIdentity({
      subject: 'alice',
      tokenIdentifier: 'alice',
      email: 'alice@example.test',
      name: 'Alice',
    })
    const bob = ctx.raw.withIdentity({
      subject: 'bob',
      tokenIdentifier: 'bob',
      email: 'bob@example.test',
      name: 'Bob',
    })

    const todoId = await alice.mutation(api.features.todos.domain.create, {
      title: 'Alice todo',
    })

    await expect(bob.mutation(api.features.todos.domain.toggle, { id: todoId })).rejects.toThrow(
      'Todo not found.',
    )

    const aliceTodos = await alice.query(api.features.todos.domain.list, {})
    const bobTodos = await bob.query(api.features.todos.domain.list, {})

    expect(aliceTodos).toHaveLength(1)
    expect(aliceTodos[0]?.title).toBe('Alice todo')
    expect(bobTodos).toHaveLength(0)
  })
})
