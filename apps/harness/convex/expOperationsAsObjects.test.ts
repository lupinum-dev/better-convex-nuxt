import { convexTest } from 'convex-test'
/**
 * Tests for Experiment 15: Operations as imported objects (no manifest).
 */
import { describe, it, expect } from 'vitest'

import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'
import { modules } from './test.setup'

async function seedOrg(t: any): Promise<Id<'organizations'>> {
  return await t.run(async (ctx: any) =>
    ctx.db.insert('organizations', {
      name: 'Org',
      slug: 'org',
      ownerId: 'u',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  )
}

describe('Experiment 15: operations as imported objects', () => {
  it('15a: op.preview and op.execute project to working Convex functions', async () => {
    const t = convexTest(schema, modules)
    const orgId = await seedOrg(t)
    const rbId = await t.mutation(internal.expOperationsAsObjects.seedRunbook, {
      orgId,
      title: 'Runbook One',
    })

    // Preview via query projection.
    const preview = await t.query(internal.expOperationsAsObjects.previewArchiveRunbook, {
      id: rbId,
    })
    expect(preview.preview.summary).toBe('Archive "Runbook One"')
    expect(preview.preview.confirm).toMatchObject({
      operation: 'archiveRunbook',
      targetId: rbId,
      currentTitle: 'Runbook One',
    })
    expect(typeof preview.confirmationToken).toBe('string')
    expect(preview.confirmationToken.length).toBeGreaterThan(50)
  })

  it('15b: execute mutation handles __preview mode and token-based execute', async () => {
    const t = convexTest(schema, modules)
    const orgId = await seedOrg(t)
    const rbId = await t.mutation(internal.expOperationsAsObjects.seedRunbook, {
      orgId,
      title: 'Runbook Two',
    })

    // __preview: true via the execute mutation (same function, preview mode).
    const previewResult = await t.mutation(internal.expOperationsAsObjects.archiveRunbook, {
      id: rbId,
      __preview: true,
    })
    expect(previewResult).toHaveProperty('preview')
    expect(previewResult).toHaveProperty('confirmationToken')
    const token = previewResult.confirmationToken

    // Execute with token.
    const executed = await t.mutation(internal.expOperationsAsObjects.archiveRunbook, {
      id: rbId,
      __confirmationToken: token,
    })
    expect(executed).toMatchObject({ archivedId: rbId })

    // Verify the mutation actually ran.
    const current = await t.query(internal.expOperationsAsObjects.getRunbook, { id: rbId })
    expect(current?.archived).toBe(true)
  })

  it('15c: preview drift (title change between preview and execute) is detected', async () => {
    const t = convexTest(schema, modules)
    const orgId = await seedOrg(t)
    const rbId = await t.mutation(internal.expOperationsAsObjects.seedRunbook, {
      orgId,
      title: 'Original',
    })

    // Preview with the original title.
    const previewResult = await t.mutation(internal.expOperationsAsObjects.archiveRunbook, {
      id: rbId,
      __preview: true,
    })
    const token = previewResult.confirmationToken

    // Rename the runbook — confirm block's currentTitle changes.
    await t.mutation(internal.expOperationsAsObjects.renameRunbook, {
      id: rbId,
      title: 'Renamed',
    })

    // Execute should fail with preview hash mismatch.
    await expect(
      t.mutation(internal.expOperationsAsObjects.archiveRunbook, {
        id: rbId,
        __confirmationToken: token,
      }),
    ).rejects.toThrow(/preview hash/i)

    // And the runbook is NOT archived.
    const current = await t.query(internal.expOperationsAsObjects.getRunbook, { id: rbId })
    expect(current?.archived).toBe(false)
  })

  it('15d: MCP introspects the operation directly — no manifest needed', async () => {
    const t = convexTest(schema, modules)
    const meta = await t.query(internal.expOperationsAsObjects.simulatedMcpIntrospection, {})
    expect(meta.name).toBe('archiveRunbook')
    expect(meta.kind).toBe('destructive')
    expect(meta.hasPreview).toBe(true)
    expect(meta.hasExecute).toBe(true)
    expect(meta.argsKeys).toEqual(['id'])
    expect(meta.isMarkedTrellisOp).toBe(true)
  })

  it('15e: tool.operation can reject a safe op used where destructive required', async () => {
    const t = convexTest(schema, modules)
    const result = await t.query(internal.expOperationsAsObjects.rejectSafeForDestructivePath, {})
    expect(result.kind).toBe('safe')
    expect(result.rejected).toBe(true)
  })
})
