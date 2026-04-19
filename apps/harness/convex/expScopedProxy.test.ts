/**
 * Experiment 8: Trellis-Owned Scope Proxy — Tests
 *
 * Compares index-based scoping vs post-fetch filtering for pagination,
 * tests compound index interception, write enforcement, trigger scoping,
 * and non-scoped table passthrough.
 */
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'

// Helper: import test modules
const modules = import.meta.glob('./**/*.ts')

async function setupOrgs(t: any) {
  const org1Id = await t.mutation(internal.expScopedProxy.seedHelper_createOrg, {
    name: 'Org 1',
  })
  const org2Id = await t.mutation(internal.expScopedProxy.seedHelper_createOrg, {
    name: 'Org 2',
  })
  return { org1Id, org2Id }
}

describe('Exp 8: Trellis-Owned Scope Proxy', () => {
  // ---- 8a: Pagination comparison ----

  it('8a: index-based scoping gives full page sizes', async () => {
    const t = convexTest(schema, modules)

    // Create orgs
    const org1Id: Id<'organizations'> = await t.run(async (ctx) => {
      return ctx.db.insert('organizations', {
        name: 'Org 1',
        slug: 'org-1',
        ownerId: 'owner-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })
    const org2Id: Id<'organizations'> = await t.run(async (ctx) => {
      return ctx.db.insert('organizations', {
        name: 'Org 2',
        slug: 'org-2',
        ownerId: 'owner-2',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })

    // Seed: 10 posts per org = 20 total
    await t.mutation(internal.expScopedProxy.seedScopeTest, {
      org1Id,
      org2Id,
    })

    // Paginate with AUTO-INDEX approach (Approach A) — page size 5
    const indexResult = await t.query(internal.expScopedProxy.test8aPaginateAutoIndex, {
      organizationId: org1Id,
      paginationOpts: { numItems: 5, cursor: null },
    })

    // Paginate with POST-FETCH FILTER approach (Approach C) — page size 5
    const filterResult = await t.query(internal.expScopedProxy.test8aPaginateFilter, {
      organizationId: org1Id,
      paginationOpts: { numItems: 5, cursor: null },
    })

    // Index approach: should get EXACTLY 5 posts (full page)
    // because the index only returns org1 posts
    console.log(`Index approach: ${indexResult.page.length} items (requested 5)`)
    console.log(`Filter approach: ${filterResult.page.length} items (requested 5)`)

    // The index approach should always give full pages
    expect(indexResult.page.length).toBe(5)
    // All posts should be from org1
    expect(indexResult.page.every((p: any) => p.organizationId === (org1Id as string))).toBe(true)

    // Collect ALL pages via index approach
    let allIndexPosts: any[] = []
    let cursor = null
    let isDone = false
    while (!isDone) {
      const page = await t.query(internal.expScopedProxy.test8aPaginateAutoIndex, {
        organizationId: org1Id,
        paginationOpts: { numItems: 5, cursor },
      })
      allIndexPosts = allIndexPosts.concat(page.page)
      cursor = page.continueCursor
      isDone = page.isDone
    }

    // Should get exactly 10 posts (all org1)
    expect(allIndexPosts.length).toBe(10)
    expect(allIndexPosts.every((p: any) => p.organizationId === (org1Id as string))).toBe(true)
  })

  // ---- 8b: Compound index with scope prepend ----

  it('8b: compound index query prepends scope automatically', async () => {
    const t = convexTest(schema, modules)

    const org1Id: Id<'organizations'> = await t.run(async (ctx) => {
      return ctx.db.insert('organizations', {
        name: 'Org 1',
        slug: 'org-1',
        ownerId: 'owner-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })
    const org2Id: Id<'organizations'> = await t.run(async (ctx) => {
      return ctx.db.insert('organizations', {
        name: 'Org 2',
        slug: 'org-2',
        ownerId: 'owner-2',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })

    await t.mutation(internal.expScopedProxy.seedScopeTest, {
      org1Id,
      org2Id,
    })

    // Query with compound index — should only see org1 published posts
    const result = await t.query(internal.expScopedProxy.test8bCompoundIndex, {
      organizationId: org1Id,
      status: 'published',
    })

    // 5 published posts in org1 (posts 1-5 are published, 6-10 are draft)
    expect(result.count).toBe(5)
    expect(result.statuses.every((s: string) => s === 'published')).toBe(true)
    expect(result.titles.every((t: string) => t.startsWith('Org1'))).toBe(true)
  })

  it('8b: blocks non-compound indexes on scoped tables', async () => {
    const t = convexTest(schema, modules)

    const org1Id: Id<'organizations'> = await t.run(async (ctx) => {
      return ctx.db.insert('organizations', {
        name: 'Org 1',
        slug: 'org-1',
        ownerId: 'owner-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })

    const result = await t.query(internal.expScopedProxy.test8bBlockedIndex, {
      organizationId: org1Id,
    })

    expect(result.blocked).toBe(true)
    expect(result.error).toContain('not registered as a compound index')
  })

  it('8b: compound proxy auto-scopes when no .withIndex() called', async () => {
    const t = convexTest(schema, modules)

    const org1Id: Id<'organizations'> = await t.run(async (ctx) => {
      return ctx.db.insert('organizations', {
        name: 'Org 1',
        slug: 'org-1',
        ownerId: 'owner-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })
    const org2Id: Id<'organizations'> = await t.run(async (ctx) => {
      return ctx.db.insert('organizations', {
        name: 'Org 2',
        slug: 'org-2',
        ownerId: 'owner-2',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })

    await t.mutation(internal.expScopedProxy.seedScopeTest, {
      org1Id,
      org2Id,
    })

    const result = await t.query(internal.expScopedProxy.test8bAutoFallback, {
      organizationId: org1Id,
    })

    // Should see only org1 posts (10)
    expect(result.count).toBe(10)
    expect(result.titles.every((t: string) => t.startsWith('Org1'))).toBe(true)
  })

  // ---- 8c: Write enforcement ----

  it('8c: scope enforced on insert, patch, delete, get', async () => {
    const t = convexTest(schema, modules)

    const org1Id: Id<'organizations'> = await t.run(async (ctx) => {
      return ctx.db.insert('organizations', {
        name: 'Org 1',
        slug: 'org-1',
        ownerId: 'owner-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })
    const org2Id: Id<'organizations'> = await t.run(async (ctx) => {
      return ctx.db.insert('organizations', {
        name: 'Org 2',
        slug: 'org-2',
        ownerId: 'owner-2',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })

    const results = await t.mutation(internal.expScopedProxy.test8cWriteEnforcement, {
      org1Id,
      org2Id,
    })

    // Insert with correct scope succeeds
    expect(results.insertCorrect).not.toContain('ERROR')

    // Insert with wrong scope fails
    expect(results.insertWrong).toContain('Scope violation on insert')

    // Patch own doc succeeds
    expect(results.patchOwn).toBe('OK')

    // Patch foreign doc fails
    expect(results.patchForeign).toContain('Scope violation on patch')

    // Delete own doc succeeds
    expect(results.deleteOwn).toBe('OK')

    // Delete foreign doc fails
    expect(results.deleteForeign).toContain('Scope violation on delete')

    // get() on foreign doc returns null
    expect(results.getForeign).toBe('null (correct)')
  })

  // ---- 8d: Trigger auto-scoping ----

  it("8d: trigger scopes to triggering document's org", async () => {
    const t = convexTest(schema, modules)

    const org1Id: Id<'organizations'> = await t.run(async (ctx) => {
      return ctx.db.insert('organizations', {
        name: 'Org 1',
        slug: 'org-1',
        ownerId: 'owner-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })
    const org2Id: Id<'organizations'> = await t.run(async (ctx) => {
      return ctx.db.insert('organizations', {
        name: 'Org 2',
        slug: 'org-2',
        ownerId: 'owner-2',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })

    const result = await t.mutation(internal.expScopedProxy.test8dTriggerScoping, {
      org1Id,
      org2Id,
    })

    // Two triggers should have fired (one per insert)
    expect(result.triggerCount).toBe(2)

    // The trigger for org1 post should only see org1 posts (1 at trigger time)
    // The trigger for org2 post should only see org2 posts (3 pre-existing + 1 new = 4)
    const org1Trigger = result.triggers[0]
    const org2Trigger = result.triggers[1]

    console.log('Trigger results:', JSON.stringify(result.triggers, null, 2))

    // Verify triggers ran and logged scope info
    expect(org1Trigger.door).toMatch(/^scoped:\d+$/)
    expect(org2Trigger.door).toMatch(/^scoped:\d+$/)

    // Key assertion: the two triggers see DIFFERENT counts
    // because they're scoped to different orgs
    const org1Count = parseInt(org1Trigger.door.split(':')[1])
    const org2Count = parseInt(org2Trigger.door.split(':')[1])
    expect(org1Count).not.toBe(org2Count)
  })

  // ---- 8e: Non-scoped tables ----

  it('8e: non-scoped tables pass through transparently', async () => {
    const t = convexTest(schema, modules)

    const result = await t.mutation(internal.expScopedProxy.test8eNonScoped, {})

    expect(result.insertWorked).toBe(true)
    expect(result.getWorked).toBe(true)
    expect(result.queryWorked).toBe(true)
  })

  // ---- 8f: Hybrid approach — user index + native .filter() ----

  it('8f: user can use their own index, proxy adds .filter() for scope', async () => {
    const t = convexTest(schema, modules)

    const org1Id: Id<'organizations'> = await t.run(async (ctx) => {
      return ctx.db.insert('organizations', {
        name: 'Org 1',
        slug: 'org-1',
        ownerId: 'owner-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })
    const org2Id: Id<'organizations'> = await t.run(async (ctx) => {
      return ctx.db.insert('organizations', {
        name: 'Org 2',
        slug: 'org-2',
        ownerId: 'owner-2',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })

    await t.mutation(internal.expScopedProxy.seedScopeTest, {
      org1Id,
      org2Id,
    })

    // User uses by_status (non-compound) — proxy adds .filter() for scope
    const result = await t.query(internal.expScopedProxy.test8fUserIndex, {
      organizationId: org1Id,
      status: 'published',
    })

    // Should see only org1 published posts (5)
    expect(result.count).toBe(5)
    expect(result.titles.every((t: string) => t.startsWith('Org1'))).toBe(true)
    // Verify all belong to org1
    expect(result.orgs.every((o: string) => o === (org1Id as string))).toBe(true)
  })

  it('8f: hybrid still uses compound index optimization when available', async () => {
    const t = convexTest(schema, modules)

    const org1Id: Id<'organizations'> = await t.run(async (ctx) => {
      return ctx.db.insert('organizations', {
        name: 'Org 1',
        slug: 'org-1',
        ownerId: 'owner-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })
    const org2Id: Id<'organizations'> = await t.run(async (ctx) => {
      return ctx.db.insert('organizations', {
        name: 'Org 2',
        slug: 'org-2',
        ownerId: 'owner-2',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })

    await t.mutation(internal.expScopedProxy.seedScopeTest, {
      org1Id,
      org2Id,
    })

    // User uses compound index — proxy prepends scope (optimized path)
    const result = await t.query(internal.expScopedProxy.test8fCompoundOptimization, {
      organizationId: org1Id,
      status: 'published',
    })

    expect(result.count).toBe(5)
    expect(result.titles.every((t: string) => t.startsWith('Org1'))).toBe(true)
  })

  it('8f: pagination with user index + .filter() scope', async () => {
    const t = convexTest(schema, modules)

    const org1Id: Id<'organizations'> = await t.run(async (ctx) => {
      return ctx.db.insert('organizations', {
        name: 'Org 1',
        slug: 'org-1',
        ownerId: 'owner-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })
    const org2Id: Id<'organizations'> = await t.run(async (ctx) => {
      return ctx.db.insert('organizations', {
        name: 'Org 2',
        slug: 'org-2',
        ownerId: 'owner-2',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })

    await t.mutation(internal.expScopedProxy.seedScopeTest, {
      org1Id,
      org2Id,
    })

    // Paginate with user index + .filter() scope — page size 3
    const page1 = await t.query(internal.expScopedProxy.test8fPaginateWithUserIndex, {
      organizationId: org1Id,
      paginationOpts: { numItems: 3, cursor: null },
    })

    console.log(`Hybrid .filter() pagination: ${page1.page.length} items (requested 3)`)
    console.log(
      `All org1? ${page1.page.every((p: any) => p.organizationId === (org1Id as string))}`,
    )

    // All returned posts should be from org1 and published
    expect(page1.page.every((p: any) => p.organizationId === (org1Id as string))).toBe(true)
    expect(page1.page.every((p: any) => p.status === 'published')).toBe(true)

    // Collect all pages
    let allPosts: any[] = [...page1.page]
    let cursor = page1.continueCursor
    let isDone = page1.isDone
    while (!isDone) {
      const nextPage = await t.query(internal.expScopedProxy.test8fPaginateWithUserIndex, {
        organizationId: org1Id,
        paginationOpts: { numItems: 3, cursor },
      })
      allPosts = allPosts.concat(nextPage.page)
      cursor = nextPage.continueCursor
      isDone = nextPage.isDone
    }

    // Should get exactly 5 posts (org1 + published)
    expect(allPosts.length).toBe(5)
  })

  it('8f: simple query auto-applies scope index', async () => {
    const t = convexTest(schema, modules)

    const org1Id: Id<'organizations'> = await t.run(async (ctx) => {
      return ctx.db.insert('organizations', {
        name: 'Org 1',
        slug: 'org-1',
        ownerId: 'owner-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })
    const org2Id: Id<'organizations'> = await t.run(async (ctx) => {
      return ctx.db.insert('organizations', {
        name: 'Org 2',
        slug: 'org-2',
        ownerId: 'owner-2',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })

    await t.mutation(internal.expScopedProxy.seedScopeTest, {
      org1Id,
      org2Id,
    })

    const result = await t.query(internal.expScopedProxy.test8fSimpleQuery, {
      organizationId: org1Id,
    })

    expect(result.count).toBe(10)
    expect(result.titles.every((t: string) => t.startsWith('Org1'))).toBe(true)
  })
})
