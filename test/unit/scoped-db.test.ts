import type { GenericDataModel, GenericDatabaseReader, GenericDatabaseWriter } from 'convex/server'
import type { GenericId } from 'convex/values'

import { describe, expect, it, vi } from 'vitest'

import { TenantError } from '../../src/runtime/tenant/errors'
import { createScopedReader, createScopedWriter } from '../../src/runtime/tenant/scoped-db'

// ============================================================================
// Mock Convex db
// ============================================================================

function createMockDb() {
  const mockQuery = {
    withIndex: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    filter: vi.fn().mockReturnThis(),
    collect: vi.fn().mockResolvedValue([]),
    first: vi.fn().mockResolvedValue(null),
    take: vi.fn().mockResolvedValue([]),
  }

  const db = {
    query: vi.fn().mockReturnValue(mockQuery),
    get: vi.fn(),
    insert: vi.fn(),
    patch: vi.fn(),
    replace: vi.fn(),
    delete: vi.fn(),
    _mockQuery: mockQuery,
  }

  return db
}

function asReaderDb(db: ReturnType<typeof createMockDb>): GenericDatabaseReader<GenericDataModel> {
  return db as unknown as GenericDatabaseReader<GenericDataModel>
}

function asWriterDb(db: ReturnType<typeof createMockDb>): GenericDatabaseWriter<GenericDataModel> {
  return db as unknown as GenericDatabaseWriter<GenericDataModel>
}

function asId(tableName: string): GenericId<string> {
  return tableName as GenericId<string>
}

const ORG_ID = 'org_abc123'
const OTHER_ORG = 'org_other'
const ORG_FIELD = 'organizationId'
const SCOPED_TABLES = ['posts', 'comments']

// ============================================================================
// ScopedReader
// ============================================================================

describe('createScopedReader', () => {
  describe('query()', () => {
    it('filters by organization index', () => {
      const db = createMockDb()
      const reader = createScopedReader(asReaderDb(db), ORG_ID, ORG_FIELD, SCOPED_TABLES)

      reader.query('posts')

      expect(db.query).toHaveBeenCalledWith('posts')
      expect(db._mockQuery.withIndex).toHaveBeenCalledWith(
        'by_organization',
        expect.any(Function),
      )
    })

    it('throws TABLE_NOT_SCOPED for unscoped tables', () => {
      const db = createMockDb()
      const reader = createScopedReader(asReaderDb(db), ORG_ID, ORG_FIELD, SCOPED_TABLES)

      expect(() => reader.query('notes')).toThrow(TenantError)
      expect(() => reader.query('notes')).toThrow('not in scopedTables')
    })

    it('wraps index errors as MISSING_ORG_INDEX', () => {
      const db = createMockDb()
      db._mockQuery.withIndex.mockImplementation(() => {
        throw new Error('Index "by_organization" not found')
      })
      const reader = createScopedReader(asReaderDb(db), ORG_ID, ORG_FIELD, SCOPED_TABLES)

      expect(() => reader.query('posts')).toThrow(TenantError)
      try {
        reader.query('posts')
      }
      catch (e) {
        expect((e as TenantError).code).toBe('MISSING_ORG_INDEX')
      }
    })
  })

  describe('get()', () => {
    it('returns documents from the same org', async () => {
      const db = createMockDb()
      const doc = { _id: 'doc1', organizationId: ORG_ID, title: 'Hello' }
      db.get.mockResolvedValue(doc)

      const reader = createScopedReader(asReaderDb(db), ORG_ID, ORG_FIELD, SCOPED_TABLES)
      const result = await reader.get(asId('doc1'))

      expect(result).toEqual(doc)
    })

    it('returns null for documents from different org', async () => {
      const db = createMockDb()
      db.get.mockResolvedValue({ _id: 'doc1', organizationId: OTHER_ORG, title: 'Secret' })

      const reader = createScopedReader(asReaderDb(db), ORG_ID, ORG_FIELD, SCOPED_TABLES)
      const result = await reader.get(asId('doc1'))

      expect(result).toBeNull()
    })

    it('returns null for non-existent documents', async () => {
      const db = createMockDb()
      db.get.mockResolvedValue(null)

      const reader = createScopedReader(asReaderDb(db), ORG_ID, ORG_FIELD, SCOPED_TABLES)
      const result = await reader.get(asId('nonexistent'))

      expect(result).toBeNull()
    })

    it('passes through documents without orgField (unscoped tables)', async () => {
      const db = createMockDb()
      const doc = { _id: 'note1', title: 'Public note' }
      db.get.mockResolvedValue(doc)

      const reader = createScopedReader(asReaderDb(db), ORG_ID, ORG_FIELD, SCOPED_TABLES)
      const result = await reader.get(asId('note1'))

      expect(result).toEqual(doc)
    })
  })
})

// ============================================================================
// ScopedWriter
// ============================================================================

describe('createScopedWriter', () => {
  describe('insert()', () => {
    it('auto-injects orgField', async () => {
      const db = createMockDb()
      db.insert.mockResolvedValue('new_id')

      const writer = createScopedWriter(asWriterDb(db), ORG_ID, ORG_FIELD, SCOPED_TABLES)
      await writer.insert('posts', { title: 'New Post' })

      expect(db.insert).toHaveBeenCalledWith('posts', {
        title: 'New Post',
        organizationId: ORG_ID,
      })
    })

    it('allows matching orgField value', async () => {
      const db = createMockDb()
      db.insert.mockResolvedValue('new_id')

      const writer = createScopedWriter(asWriterDb(db), ORG_ID, ORG_FIELD, SCOPED_TABLES)
      await writer.insert('posts', { title: 'Post', organizationId: ORG_ID })

      expect(db.insert).toHaveBeenCalled()
    })

    it('throws ORG_FIELD_CONFLICT for different orgField', async () => {
      const db = createMockDb()
      const writer = createScopedWriter(asWriterDb(db), ORG_ID, ORG_FIELD, SCOPED_TABLES)

      await expect(
        writer.insert('posts', { title: 'Post', organizationId: OTHER_ORG }),
      ).rejects.toThrow(TenantError)
    })

    it('throws TABLE_NOT_SCOPED for unscoped tables', async () => {
      const db = createMockDb()
      const writer = createScopedWriter(asWriterDb(db), ORG_ID, ORG_FIELD, SCOPED_TABLES)

      await expect(
        writer.insert('notes', { title: 'Note' }),
      ).rejects.toThrow('not in scopedTables')
    })
  })

  describe('patch()', () => {
    it('validates org ownership before patching', async () => {
      const db = createMockDb()
      db.get.mockResolvedValue({ _id: 'doc1', organizationId: ORG_ID, title: 'Old' })

      const writer = createScopedWriter(asWriterDb(db), ORG_ID, ORG_FIELD, SCOPED_TABLES)
      await writer.patch(asId('doc1'), { title: 'New' })

      expect(db.get).toHaveBeenCalledWith('doc1')
      expect(db.patch).toHaveBeenCalledWith('doc1', { title: 'New' })
    })

    it('throws CROSS_ORG_ACCESS for wrong org', async () => {
      const db = createMockDb()
      db.get.mockResolvedValue({ _id: 'doc1', organizationId: OTHER_ORG })

      const writer = createScopedWriter(asWriterDb(db), ORG_ID, ORG_FIELD, SCOPED_TABLES)

      await expect(
        writer.patch(asId('doc1'), { title: 'Hacked' }),
      ).rejects.toThrow(TenantError)
    })

    it('throws RESOURCE_NOT_FOUND for missing document', async () => {
      const db = createMockDb()
      db.get.mockResolvedValue(null)

      const writer = createScopedWriter(asWriterDb(db), ORG_ID, ORG_FIELD, SCOPED_TABLES)

      await expect(
        writer.patch(asId('nonexistent'), { title: 'X' }),
      ).rejects.toThrow('Document not found')
    })

    it('throws ORG_FIELD_CONFLICT when changing org', async () => {
      const db = createMockDb()
      db.get.mockResolvedValue({ _id: 'doc1', organizationId: ORG_ID })

      const writer = createScopedWriter(asWriterDb(db), ORG_ID, ORG_FIELD, SCOPED_TABLES)

      await expect(
        writer.patch(asId('doc1'), { organizationId: OTHER_ORG }),
      ).rejects.toThrow(TenantError)
    })
  })

  describe('replace()', () => {
    it('validates org ownership and auto-injects orgField', async () => {
      const db = createMockDb()
      db.get.mockResolvedValue({ _id: 'doc1', organizationId: ORG_ID })

      const writer = createScopedWriter(asWriterDb(db), ORG_ID, ORG_FIELD, SCOPED_TABLES)
      await writer.replace(asId('doc1'), { title: 'Replaced' })

      expect(db.replace).toHaveBeenCalledWith('doc1', {
        title: 'Replaced',
        organizationId: ORG_ID,
      })
    })

    it('throws CROSS_ORG_ACCESS for wrong org', async () => {
      const db = createMockDb()
      db.get.mockResolvedValue({ _id: 'doc1', organizationId: OTHER_ORG })

      const writer = createScopedWriter(asWriterDb(db), ORG_ID, ORG_FIELD, SCOPED_TABLES)

      await expect(
        writer.replace(asId('doc1'), { title: 'Hacked' }),
      ).rejects.toThrow(TenantError)
    })
  })

  describe('delete()', () => {
    it('validates org ownership before deleting', async () => {
      const db = createMockDb()
      db.get.mockResolvedValue({ _id: 'doc1', organizationId: ORG_ID })

      const writer = createScopedWriter(asWriterDb(db), ORG_ID, ORG_FIELD, SCOPED_TABLES)
      await writer.delete(asId('doc1'))

      expect(db.get).toHaveBeenCalledWith('doc1')
      expect(db.delete).toHaveBeenCalledWith('doc1')
    })

    it('throws CROSS_ORG_ACCESS for wrong org', async () => {
      const db = createMockDb()
      db.get.mockResolvedValue({ _id: 'doc1', organizationId: OTHER_ORG })

      const writer = createScopedWriter(asWriterDb(db), ORG_ID, ORG_FIELD, SCOPED_TABLES)

      await expect(
        writer.delete(asId('doc1')),
      ).rejects.toThrow(TenantError)
    })

    it('throws RESOURCE_NOT_FOUND for missing document', async () => {
      const db = createMockDb()
      db.get.mockResolvedValue(null)

      const writer = createScopedWriter(asWriterDb(db), ORG_ID, ORG_FIELD, SCOPED_TABLES)

      await expect(
        writer.delete(asId('nonexistent')),
      ).rejects.toThrow('Document not found')
    })
  })
})
