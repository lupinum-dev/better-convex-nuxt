import { convexTest } from 'convex-test'
/**
 * Tests for Experiment 13: Per-table scope config.
 */
import { describe, it, expect } from 'vitest'

import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'
import { modules } from './test.setup'

async function setup(t: any) {
  const org1Id: Id<'organizations'> = await t.run(async (ctx: any) =>
    ctx.db.insert('organizations', {
      name: 'Org 1',
      slug: 'org-1',
      ownerId: 'u1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  )
  const org2Id: Id<'organizations'> = await t.run(async (ctx: any) =>
    ctx.db.insert('organizations', {
      name: 'Org 2',
      slug: 'org-2',
      ownerId: 'u2',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  )
  const seeded = await t.mutation(internal.expPerTableScope.seed, { org1Id, org2Id })
  return { org1Id, org2Id, ...seeded }
}

describe('Experiment 13: per-table scope config', () => {
  it('13a: proxy dispatches per-table (workspaces by org, documents by workspace)', async () => {
    const t = convexTest(schema, modules)
    const ctx = await setup(t)
    const result = await t.query(internal.expPerTableScope.readWorkspacesAndDocs, {
      orgId: ctx.org1Id,
      workspaceId: ctx.ws1A,
    })
    // Org 1 has 2 workspaces.
    expect(result.workspacesInOrg).toBe(2)
    // Workspace 1A has exactly 1 document.
    expect(result.documentsInWorkspace).toBe(1)
  })

  it("13b: .withIndex rewriting uses each table's scope field", async () => {
    const t = convexTest(schema, modules)
    const ctx = await setup(t)
    const draftCount = await t.query(internal.expPerTableScope.readDocsByStatus, {
      workspaceId: ctx.ws1A,
      status: 'draft',
    })
    expect(draftCount).toBe(1) // Doc in WS-1A is 'draft'
    const pubCount = await t.query(internal.expPerTableScope.readDocsByStatus, {
      workspaceId: ctx.ws1A,
      status: 'published',
    })
    expect(pubCount).toBe(0) // The 'published' doc is in WS-1B
  })

  it("13c: insert rejections use each table's scope field", async () => {
    const t = convexTest(schema, modules)
    const ctx = await setup(t)
    const result = await t.mutation(internal.expPerTableScope.tryWrongScopeInsert, {
      actorOrgId: ctx.org1Id,
      appIdentityWorkspaceId: ctx.ws1A,
      wrongOrgId: ctx.org2Id,
      wrongWorkspaceId: ctx.ws2A,
    })
    expect(result.workspaceInsertRejected).toBe(true)
    expect(result.documentInsertRejected).toBe(true)
  })

  it('13d: non-compound index on a scoped table throws with useful message', async () => {
    const t = convexTest(schema, modules)
    const ctx = await setup(t)
    const result = await t.query(internal.expPerTableScope.tryNonCompoundIndex, {
      workspaceId: ctx.ws1A,
    })
    expect(result.rejected).toBe(true)
    expect(result.message).toContain('by_status')
    expect(result.message).toContain('expDocuments')
    expect(result.message).toContain('workspaceId')
  })

  it('13e: different workspaces in the same org see different documents', async () => {
    const t = convexTest(schema, modules)
    const ctx = await setup(t)
    const result = await t.query(internal.expPerTableScope.compareWorkspaceIsolation, {
      wsA: ctx.ws1A,
      wsB: ctx.ws1B,
    })
    expect(result.docsInA).toBe(1) // Only doc1A
    expect(result.docsInB).toBe(1) // Only doc1B
    // Crucially: they are different documents — no leakage between WS within same org.
  })
})
