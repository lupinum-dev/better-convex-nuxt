import { convexTest } from 'convex-test'
import type { FunctionReference } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { api } from '../_generated/api'
import schema from '../schema'
import { modules } from '../test.setup'

const TEST_BRIDGE_KEY = 'playground-test-bridge-key'
const privateSystemOverview = (
  api as unknown as Record<string, { systemOverview: FunctionReference<'query'> }>
)['private/demo']!.systemOverview

describe('private.demo.systemOverview', () => {
  beforeEach(() => {
    process.env.CONVEX_PRIVATE_BRIDGE_KEY = TEST_BRIDGE_KEY
  })

  afterEach(() => {
    delete process.env.CONVEX_PRIVATE_BRIDGE_KEY
  })

  it('returns privileged system counts with the correct bridge key', async () => {
    const t = convexTest(schema, modules)

    await t.mutation(api.notes.add, { title: 'Note', content: 'Content' })
    await t.run(async (ctx) => {
      await ctx.db.insert('tasks', {
        userId: 'system',
        title: 'Task',
        completed: false,
        createdAt: Date.now(),
      })
      await ctx.db.insert('users', {
        authId: 'system-user',
        role: 'owner',
        organizationId: undefined,
        displayName: 'System User',
        email: 'system@example.com',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })

    const result = await t.query(privateSystemOverview, {
      apiKey: TEST_BRIDGE_KEY,
    })

    expect(result).toMatchObject({
      lane: 'privileged',
      notes: 1,
      tasks: 1,
      users: 1,
    })
  })

  it('rejects a wrong bridge key', async () => {
    const t = convexTest(schema, modules)

    await expect(
      t.query(privateSystemOverview, {
        apiKey: 'wrong-key',
      }),
    ).rejects.toThrow('Invalid API key')
  })

  it('rejects calls when the bridge key is missing from the backend env', async () => {
    const t = convexTest(schema, modules)
    delete process.env.CONVEX_PRIVATE_BRIDGE_KEY

    await expect(
      t.query(privateSystemOverview, {
        apiKey: TEST_BRIDGE_KEY,
      }),
    ).rejects.toThrow('Missing CONVEX_PRIVATE_BRIDGE_KEY')
  })
})
