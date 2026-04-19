/**
 * Experiment 2: Three-Door DB Model — Tests
 */
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { internal } from './_generated/api'
import schema from './schema'
import { modules } from './test.setup'

describe('Exp 2: Three-Door DB Model', () => {
  it('2a: Write via three doors — RLS, triggers, and bypass behavior', async () => {
    const t = convexTest(schema, modules)

    // Create two orgs
    const org1Id = await t.run(async (ctx) => {
      return await ctx.db.insert('organizations', {
        name: 'Org 1',
        slug: 'org-1',
        ownerId: 'user_1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })
    const org2Id = await t.run(async (ctx) => {
      return await ctx.db.insert('organizations', {
        name: 'Org 2',
        slug: 'org-2',
        ownerId: 'user_2',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })

    const results = await t.mutation(internal.expThreeDoors.writeViaThreeDoors, {
      organizationId: org1Id,
      wrongOrgId: org2Id,
    })

    // Door 1 with matching org: succeeds
    expect(results.door1Success).toBeTruthy()

    // Door 1 with wrong org: RLS denies
    expect(results.door1WrongOrgError).toBeTruthy()
    expect(results.door1WrongOrgError).not.toBe('')

    // Door 2 (unsafeDb) with wrong org: succeeds (RLS bypassed)
    expect(results.door2Success).toBeTruthy()

    // Door 3 (rawDb): succeeds
    expect(results.door3Success).toBeTruthy()

    // Triggers: door1 and door2 should fire (2 entries), door3 should NOT
    // Note: door1 wrong org write failed, so only door1 success + door2 = 2 triggers
    expect(Number(results.triggerLogCount)).toBe(2)
  })

  it('2b: Read via different doors — RLS filtering vs raw', async () => {
    const t = convexTest(schema, modules)

    // Create two orgs
    const org1Id = await t.run(async (ctx) => {
      return await ctx.db.insert('organizations', {
        name: 'Org 1',
        slug: 'org-1',
        ownerId: 'user_1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })
    const org2Id = await t.run(async (ctx) => {
      return await ctx.db.insert('organizations', {
        name: 'Org 2',
        slug: 'org-2',
        ownerId: 'user_2',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })

    // Seed posts in both orgs
    await t.run(async (ctx) => {
      await ctx.db.insert('posts', {
        title: 'Org1 Post',
        content: 'a',
        status: 'published',
        ownerId: 'user_1',
        organizationId: org1Id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      await ctx.db.insert('posts', {
        title: 'Org2 Post',
        content: 'b',
        status: 'published',
        ownerId: 'user_2',
        organizationId: org2Id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })

    const results = await t.mutation(internal.expThreeDoors.readViaThreeDoors, {
      organizationId: org1Id,
    })

    // RLS-wrapped (door 1): only sees org1 posts
    expect(results.door1Count).toBe(1)
    expect(results.door1Titles).toContain('Org1 Post')
    expect(results.door1Titles).not.toContain('Org2 Post')

    // Raw (door 3): sees all posts
    expect(results.door3Count).toBe(2)
  })

  it("2c: Two wrapDB calls in same mutation don't interfere", async () => {
    const t = convexTest(schema, modules)

    const orgId = await t.run(async (ctx) => {
      return await ctx.db.insert('organizations', {
        name: 'Test Org',
        slug: 'test',
        ownerId: 'user_1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })

    const result = await t.mutation(internal.expThreeDoors.testTwoWrapDbCalls, {
      organizationId: orgId,
    })

    expect(result.success).toBe(true)
    // Both writes should trigger (2 trigger log entries)
    expect(result.triggerLogCount).toBe(2)
  })
})
