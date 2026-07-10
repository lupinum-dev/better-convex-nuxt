/**
 * Files (Convex Storage) Tests
 *
 * Backend example for the file-storage docs: verifies
 * generateUploadUrl/getUrl/deleteFile enforce authentication + ownership.
 */

import { convexTest } from 'convex-test'
import { describe, it, expect } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'
import { modules } from './test.setup'

describe('files.generateUploadUrl', () => {
  it('throws for unauthenticated callers', async () => {
    const t = convexTest(schema, modules)

    await expect(t.mutation(api.files.generateUploadUrl, {})).rejects.toThrow('Not authenticated')
  })

  it('returns an upload URL for authenticated callers', async () => {
    const t = convexTest(schema, modules)
    const asUser = t.withIdentity({ subject: 'user_1' })

    const url = await asUser.mutation(api.files.generateUploadUrl, {})
    expect(typeof url).toBe('string')
  })
})

describe('files.saveFile', () => {
  it('throws for unauthenticated callers', async () => {
    const t = convexTest(schema, modules)

    const storageId = await t.run(async (ctx) => {
      return await ctx.storage.store(new Blob(['content']))
    })

    await expect(t.mutation(api.files.saveFile, { storageId })).rejects.toThrow('Not authenticated')
  })

  it('records the caller as owner', async () => {
    const t = convexTest(schema, modules)
    const asUser = t.withIdentity({ subject: 'user_1' })

    const storageId = await t.run(async (ctx) => {
      return await ctx.storage.store(new Blob(['content']))
    })
    await asUser.mutation(api.files.saveFile, { storageId })

    const file = await t.run(async (ctx) => {
      return await ctx.db
        .query('files')
        .withIndex('by_storage', (q) => q.eq('storageId', storageId))
        .unique()
    })
    expect(file?.ownerId).toBe('user_1')
  })

  it('rejects a second registration of the same storageId (claim-race guard)', async () => {
    const t = convexTest(schema, modules)
    const asOwner = t.withIdentity({ subject: 'user_owner' })
    const asOther = t.withIdentity({ subject: 'user_other' })

    const storageId = await t.run(async (ctx) => {
      return await ctx.storage.store(new Blob(['content']))
    })
    await asOwner.mutation(api.files.saveFile, { storageId })

    await expect(asOther.mutation(api.files.saveFile, { storageId })).rejects.toThrow(
      'File already registered',
    )

    // Ownership is unchanged - the original owner still resolves the file.
    const url = await asOwner.query(api.files.getUrl, { storageId })
    expect(typeof url).toBe('string')
  })
})

describe('files.getUrl', () => {
  it('returns null for unauthenticated callers', async () => {
    const t = convexTest(schema, modules)
    const asOwner = t.withIdentity({ subject: 'user_owner' })

    const storageId = await t.run(async (ctx) => {
      return await ctx.storage.store(new Blob(['content']))
    })
    await asOwner.mutation(api.files.saveFile, { storageId })

    const url = await t.query(api.files.getUrl, { storageId })
    expect(url).toBeNull()
  })

  it('returns null for a caller who does not own the file', async () => {
    const t = convexTest(schema, modules)
    const asOwner = t.withIdentity({ subject: 'user_owner' })
    const asOther = t.withIdentity({ subject: 'user_other' })

    const storageId = await t.run(async (ctx) => {
      return await ctx.storage.store(new Blob(['content']))
    })
    await asOwner.mutation(api.files.saveFile, { storageId })

    const url = await asOther.query(api.files.getUrl, { storageId })
    expect(url).toBeNull()
  })

  it('returns null when no ownership record exists yet', async () => {
    const t = convexTest(schema, modules)
    const asOwner = t.withIdentity({ subject: 'user_owner' })

    const storageId = await t.run(async (ctx) => {
      return await ctx.storage.store(new Blob(['content']))
    })
    // saveFile was never called - no owner recorded.

    const url = await asOwner.query(api.files.getUrl, { storageId })
    expect(url).toBeNull()
  })

  it('returns the URL for the owning caller', async () => {
    const t = convexTest(schema, modules)
    const asOwner = t.withIdentity({ subject: 'user_owner' })

    const storageId = await t.run(async (ctx) => {
      return await ctx.storage.store(new Blob(['content']))
    })
    await asOwner.mutation(api.files.saveFile, { storageId })

    const url = await asOwner.query(api.files.getUrl, { storageId })
    expect(typeof url).toBe('string')
  })
})

describe('files.deleteFile', () => {
  it('throws for unauthenticated callers', async () => {
    const t = convexTest(schema, modules)
    const asOwner = t.withIdentity({ subject: 'user_owner' })

    const storageId = await t.run(async (ctx) => {
      return await ctx.storage.store(new Blob(['content']))
    })
    await asOwner.mutation(api.files.saveFile, { storageId })

    await expect(t.mutation(api.files.deleteFile, { storageId })).rejects.toThrow(
      'Not authenticated',
    )
  })

  it('throws for a caller who does not own the file (IDOR guard)', async () => {
    const t = convexTest(schema, modules)
    const asOwner = t.withIdentity({ subject: 'user_owner' })
    const asOther = t.withIdentity({ subject: 'user_other' })

    const storageId = await t.run(async (ctx) => {
      return await ctx.storage.store(new Blob(['content']))
    })
    await asOwner.mutation(api.files.saveFile, { storageId })

    await expect(asOther.mutation(api.files.deleteFile, { storageId })).rejects.toThrow(
      'Not authorized',
    )

    // File must still be resolvable by its owner - the attacker's call had no effect.
    const url = await asOwner.query(api.files.getUrl, { storageId })
    expect(typeof url).toBe('string')
  })

  it('allows the owner to delete their file', async () => {
    const t = convexTest(schema, modules)
    const asOwner = t.withIdentity({ subject: 'user_owner' })

    const storageId = await t.run(async (ctx) => {
      return await ctx.storage.store(new Blob(['content']))
    })
    await asOwner.mutation(api.files.saveFile, { storageId })

    await asOwner.mutation(api.files.deleteFile, { storageId })

    const url = await asOwner.query(api.files.getUrl, { storageId })
    expect(url).toBeNull()
  })
})
