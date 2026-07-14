import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api, internal } from './_generated/api'
import schema from './schema'
import { modules } from './test.setup'

describe('demo resource bounds', () => {
  it('uses an indexed bounded batch when purging old data', async () => {
    const t = convexTest(schema, modules)
    const oldTimestamp = Date.now() - 13 * 60 * 60 * 1_000
    await t.run(async (ctx) => {
      for (let index = 0; index < 101; index += 1) {
        await ctx.db.insert('demoTasks', {
          title: `Old ${index}`,
          completed: false,
          userId: 'user_a',
          createdAt: oldTimestamp,
        })
      }
      await ctx.db.insert('demoTasks', {
        title: 'Fresh',
        completed: false,
        userId: 'user_a',
        createdAt: Date.now(),
      })
    })

    const result = await t.mutation(internal.cleanup.purgeOldData, {})

    expect(result.deletedTasks).toBe(100)
    const remaining = await t.run(async (ctx) => await ctx.db.query('demoTasks').collect())
    expect(remaining).toHaveLength(2)
    expect(remaining.some((task) => task.title === 'Fresh')).toBe(true)
  })

  it('caps owner-scoped task clearing at one hundred writes per call', async () => {
    const t = convexTest(schema, modules)
    await t.run(async (ctx) => {
      for (let index = 0; index < 101; index += 1) {
        await ctx.db.insert('demoTasks', {
          title: `Task ${index}`,
          completed: false,
          userId: 'user_a',
          createdAt: index,
        })
      }
      await ctx.db.insert('demoTasks', {
        title: 'Other user',
        completed: false,
        userId: 'user_b',
        createdAt: 0,
      })
    })

    expect(await t.withIdentity({ subject: 'user_a' }).mutation(api.tasks.clearAll, {})).toEqual({
      deleted: 100,
      hasMore: true,
    })
    const remaining = await t.run(async (ctx) => await ctx.db.query('demoTasks').collect())
    expect(remaining.filter((task) => task.userId === 'user_a')).toHaveLength(1)
    expect(remaining.filter((task) => task.userId === 'user_b')).toHaveLength(1)
  })

  it('rejects oversized collection requests and text payloads', async () => {
    const t = convexTest(schema, modules)
    const asUser = t.withIdentity({ subject: 'user_a' })

    await expect(
      asUser.query(api.messages.listPaginated, {
        paginationOpts: { cursor: null, numItems: 51 },
      }),
    ).rejects.toThrow('between 1 and 50')
    await expect(asUser.mutation(api.tasks.add, { title: 'x'.repeat(121) })).rejects.toThrow(
      'between 1 and 120',
    )
    await expect(
      asUser.mutation(api.feed.add, { content: 'x'.repeat(5_001), type: 'message' }),
    ).rejects.toThrow('between 1 and 5000')
    await expect(asUser.mutation(api.messages.add, { content: 'x'.repeat(5_001) })).rejects.toThrow(
      'between 1 and 5000',
    )
  })

  it('filters by the indexed feed type before applying the result limit', async () => {
    const t = convexTest(schema, modules)
    await t.run(async (ctx) => {
      await ctx.db.insert('feedItems', {
        content: 'Wanted',
        type: 'message',
        authorId: 'user_a',
        createdAt: 0,
      })
      for (let index = 0; index < 105; index += 1) {
        await ctx.db.insert('feedItems', {
          content: `Unrelated ${index}`,
          type: 'event',
          authorId: 'user_a',
          createdAt: index + 1,
        })
      }
    })

    expect(
      await t.withIdentity({ subject: 'user_a' }).query(api.feed.listFiltered, {
        type: 'message',
        limit: 50,
      }),
    ).toEqual([expect.objectContaining({ content: 'Wanted', type: 'message' })])
  })
})
