/**
 * Experiment 9: Auto-Compound Indexes — Tests
 *
 * Tests trellisTable() auto-compounding logic and transparent index mapping.
 */
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { autoCompoundIndexes } from './expAutoCompound'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

// Helper: create two orgs and seed posts
async function setupSeeded(t: any) {
  const org1Id: Id<'organizations'> = await t.run(async (ctx: any) => {
    return ctx.db.insert('organizations', {
      name: 'Org 1',
      slug: 'org-1',
      ownerId: 'owner-1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  })
  const org2Id: Id<'organizations'> = await t.run(async (ctx: any) => {
    return ctx.db.insert('organizations', {
      name: 'Org 2',
      slug: 'org-2',
      ownerId: 'owner-2',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  })
  await t.mutation(internal.expAutoCompound.seedAutoCompound, { org1Id, org2Id })
  return { org1Id, org2Id }
}

describe('Exp 9: Auto-Compound Indexes', () => {
  // ---- Unit test: autoCompoundIndexes logic ----

  it('9-unit: autoCompoundIndexes generates correct compounds', () => {
    const result = autoCompoundIndexes({
      scopeField: 'organizationId',
      userIndexes: [
        { name: 'by_status', fields: ['status'] },
        { name: 'by_owner', fields: ['ownerId'] },
        { name: 'by_status_date', fields: ['status', 'createdAt'] },
        // User already includes scope field — should not double-prepend
        { name: 'by_org_custom', fields: ['organizationId', 'priority'] },
      ],
    })

    // Scope index auto-added
    expect(result.scopeIndex).toEqual({
      name: 'by_organizationId',
      fields: ['organizationId'],
    })

    // Check compound indexes
    const byStatus = result.compoundIndexes.find((i) => i.name === 'by_status')
    expect(byStatus!.fields).toEqual(['organizationId', 'status'])

    const byOwner = result.compoundIndexes.find((i) => i.name === 'by_owner')
    expect(byOwner!.fields).toEqual(['organizationId', 'ownerId'])

    const byStatusDate = result.compoundIndexes.find((i) => i.name === 'by_status_date')
    expect(byStatusDate!.fields).toEqual(['organizationId', 'status', 'createdAt'])

    // Already starts with scope — not double-prepended
    const byOrgCustom = result.compoundIndexes.find((i) => i.name === 'by_org_custom')
    expect(byOrgCustom!.fields).toEqual(['organizationId', 'priority'])
  })

  // ---- 9a: Transparent index query ----

  it('9a: user index call auto-prepends scope field', async () => {
    const t = convexTest(schema, modules)
    const { org1Id } = await setupSeeded(t)

    const result = await t.query(internal.expAutoCompound.test9aTransparentIndex, {
      organizationId: org1Id,
      status: 'published',
    })

    expect(result.count).toBe(5)
    expect(result.allCorrectOrg).toBe(true)
    expect(result.allCorrectStatus).toBe(true)
  })

  it('9a: draft posts only from org1', async () => {
    const t = convexTest(schema, modules)
    const { org1Id } = await setupSeeded(t)

    const result = await t.query(internal.expAutoCompound.test9aTransparentIndex, {
      organizationId: org1Id,
      status: 'draft',
    })

    expect(result.count).toBe(5)
    expect(result.allCorrectOrg).toBe(true)
    expect(result.allCorrectStatus).toBe(true)
  })

  // ---- 9b: Simple query ----

  it('9b: simple query auto-scopes via scope index', async () => {
    const t = convexTest(schema, modules)
    const { org1Id } = await setupSeeded(t)

    const result = await t.query(internal.expAutoCompound.test9bSimpleQuery, {
      organizationId: org1Id,
    })

    expect(result.count).toBe(10)
    expect(result.allCorrectOrg).toBe(true)
  })

  // ---- 9c: Pagination ----

  it('9c: pagination with transparent compound index', async () => {
    const t = convexTest(schema, modules)
    const { org1Id } = await setupSeeded(t)

    // Page 1: 3 items
    const page1 = await t.query(internal.expAutoCompound.test9cPaginate, {
      organizationId: org1Id,
      paginationOpts: { numItems: 3, cursor: null },
    })

    expect(page1.page.length).toBe(3)
    expect(page1.page.every((p: any) => p.organizationId === (org1Id as string))).toBe(true)
    expect(page1.page.every((p: any) => p.status === 'published')).toBe(true)

    // Collect all pages
    let all: any[] = [...page1.page]
    let cursor = page1.continueCursor
    let isDone = page1.isDone
    while (!isDone) {
      const next = await t.query(internal.expAutoCompound.test9cPaginate, {
        organizationId: org1Id,
        paginationOpts: { numItems: 3, cursor },
      })
      all = all.concat(next.page)
      cursor = next.continueCursor
      isDone = next.isDone
    }

    // 5 published posts in org1
    expect(all.length).toBe(5)
  })

  // ---- 9d: Write enforcement ----

  it('9d: writes enforce scope', async () => {
    const t = convexTest(schema, modules)
    const { org1Id, org2Id } = await setupSeeded(t)

    const results = await t.mutation(internal.expAutoCompound.test9dWrites, {
      org1Id,
      org2Id,
    })

    expect(results.insertCorrect).toBe('OK')
    expect(results.patchOwn).toBe('OK')
    expect(results.deleteOwn).toBe('OK')
    expect(results.insertWrong).toBe('BLOCKED')
    expect(results.patchForeign).toBe('BLOCKED')
    expect(results.getForeign).toBe('HIDDEN')
  })

  // ---- 9e: Unknown index error ----

  it('9e: unknown index throws helpful error', async () => {
    const t = convexTest(schema, modules)

    const org1Id: Id<'organizations'> = await t.run(async (ctx: any) => {
      return ctx.db.insert('organizations', {
        name: 'Org 1',
        slug: 'org-1',
        ownerId: 'owner-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })

    const result = await t.query(internal.expAutoCompound.test9eUnknownIndex, {
      organizationId: org1Id,
    })

    expect(result.error).toContain('Unknown index')
    expect(result.error).toContain('by_nonexistent')
  })

  // ---- 9f: Non-scoped passthrough ----

  it('9f: non-scoped tables pass through', async () => {
    const t = convexTest(schema, modules)

    const org1Id: Id<'organizations'> = await t.run(async (ctx: any) => {
      return ctx.db.insert('organizations', {
        name: 'Org 1',
        slug: 'org-1',
        ownerId: 'owner-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })

    const result = await t.mutation(internal.expAutoCompound.test9fNonScoped, {
      organizationId: org1Id,
    })

    expect(result.insertOk).toBe(true)
    expect(result.getOk).toBe(true)
    expect(result.queryOk).toBe(true)
  })
})
