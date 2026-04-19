/**
 * Experiment 5: RLS + Pagination Interaction — Tests
 */
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { internal } from './_generated/api'
import schema from './schema'
import { modules } from './test.setup'

// Helper: create two orgs and seed 20 posts (10 per org)
async function seedTestData(t: ReturnType<typeof convexTest>) {
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

  await t.mutation(internal.expPagination.seedPosts, { org1Id, org2Id })

  return { org1Id, org2Id }
}

describe('Exp 5: RLS + Pagination Interaction', () => {
  it('5a: RLS pagination returns only matching posts', async () => {
    const t = convexTest(schema, modules)
    const { org1Id } = await seedTestData(t)

    // Paginate org1 posts, 5 at a time
    const collected: any[] = []
    let cursor: string | null = null
    let isDone = false

    while (!isDone) {
      const page = await t.query(internal.expPagination.paginateWithRls, {
        organizationId: org1Id,
        paginationOpts: { numItems: 5, cursor },
      })

      collected.push(...page.page)
      isDone = page.isDone
      cursor = page.continueCursor
    }

    // Should have exactly 10 posts, all from org1
    expect(collected).toHaveLength(10)
    for (const post of collected) {
      expect(post.title).toMatch(/^Org1 Post/)
      expect(post.organizationId).toBe(org1Id)
    }
  })

  it('5b: Raw pagination sees all posts', async () => {
    const t = convexTest(schema, modules)
    await seedTestData(t)

    // Paginate all posts, 5 at a time
    const collected: any[] = []
    let cursor: string | null = null
    let isDone = false

    while (!isDone) {
      const page = await t.query(internal.expPagination.paginateRaw, {
        paginationOpts: { numItems: 5, cursor },
      })

      collected.push(...page.page)
      isDone = page.isDone
      cursor = page.continueCursor
    }

    // Should have all 20 posts
    expect(collected).toHaveLength(20)
  })

  it('5c: Cursor continuity through RLS — no duplicates', async () => {
    const t = convexTest(schema, modules)
    const { org1Id } = await seedTestData(t)

    // Paginate org1 with small page size of 3
    const firstPage = await t.query(internal.expPagination.paginateWithRls, {
      organizationId: org1Id,
      paginationOpts: { numItems: 3, cursor: null },
    })

    expect(firstPage.page.length).toBeGreaterThan(0)
    expect(firstPage.page.length).toBeLessThanOrEqual(3)

    // Use continueCursor for the second page
    const secondPage = await t.query(internal.expPagination.paginateWithRls, {
      organizationId: org1Id,
      paginationOpts: { numItems: 3, cursor: firstPage.continueCursor },
    })

    // All results should be from org1
    for (const post of [...firstPage.page, ...secondPage.page]) {
      expect(post.title).toMatch(/^Org1 Post/)
    }

    // No duplicates between pages
    const firstIds = new Set(firstPage.page.map((p: any) => p._id))
    for (const post of secondPage.page) {
      expect(firstIds.has(post._id)).toBe(false)
    }
  })

  it('5d: Page sizes may be smaller with RLS (expected behavior)', async () => {
    const t = convexTest(schema, modules)
    const { org1Id } = await seedTestData(t)

    // Request 10 items — but the underlying page may contain a mix of
    // org1 and org2 posts. RLS filters out org2 posts after the DB
    // returns the page, so the returned page can have fewer than 10.
    const page = await t.query(internal.expPagination.paginateWithRls, {
      organizationId: org1Id,
      paginationOpts: { numItems: 10, cursor: null },
    })

    // The page should have at most 10 items
    expect(page.page.length).toBeLessThanOrEqual(10)

    // All returned items should be from org1
    for (const post of page.page) {
      expect(post.title).toMatch(/^Org1 Post/)
    }

    // BEHAVIOR NOTE: If this page has fewer than 10 items and isDone
    // is false, it means RLS filtered some out from the underlying
    // page. This is the expected interaction between RLS and pagination —
    // the DB fetches numItems rows, then RLS removes non-matching ones.
    if (!page.isDone && page.page.length < 10) {
      // This is the documented "smaller page" behavior
      expect(page.page.length).toBeGreaterThan(0)
    }
  })
})
