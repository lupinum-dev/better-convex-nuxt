import type { GenericDataModel, GenericDatabaseReader, GenericDatabaseWriter } from 'convex/server'
import type { GenericId } from 'convex/values'

import { describe, expect, it, vi } from 'vitest'

import { ScopingError } from '../../src/runtime/scoping/errors'
import {
  createScopedReader as buildScopedReader,
  createScopedWriter as buildScopedWriter,
} from '../../src/runtime/scoping/scoped-db'

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
    normalizeId: vi.fn((table: string, id: string) => {
      if (id.startsWith(`${table}:`)) return id as GenericId<string>
      return null
    }),
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
const TENANT_INDEX = 'by_organization'
const SCOPED_TABLES = ['posts', 'comments']

function createScopedReader(
  db: GenericDatabaseReader<GenericDataModel>,
  tenantId: string,
  tenantField: string,
  scopedTables: readonly string[],
) {
  return buildScopedReader(db, tenantId, tenantField, TENANT_INDEX, scopedTables)
}

function createScopedWriter(
  db: GenericDatabaseWriter<GenericDataModel>,
  tenantId: string,
  tenantField: string,
  scopedTables: readonly string[],
) {
  return buildScopedWriter(db, tenantId, tenantField, TENANT_INDEX, scopedTables)
}

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

    it('passes through unscoped tables', () => {
      const db = createMockDb()
      const reader = createScopedReader(asReaderDb(db), ORG_ID, ORG_FIELD, SCOPED_TABLES)

      reader.query('notes')

      expect(db.query).toHaveBeenCalledWith('notes')
      expect(db._mockQuery.withIndex).not.toHaveBeenCalled()
    })

    it('wraps index errors as MISSING_ORG_INDEX', () => {
      const db = createMockDb()
      db._mockQuery.withIndex.mockImplementation(() => {
        throw new Error('Index "by_organization" not found')
      })
      const reader = createScopedReader(asReaderDb(db), ORG_ID, ORG_FIELD, SCOPED_TABLES)

      expect(() => reader.query('posts')).toThrow(ScopingError)
      try {
        reader.query('posts')
      }
      catch (e) {
        expect((e as ScopingError).code).toBe('MISSING_ORG_INDEX')
      }
    })
  })

  describe('get()', () => {
    it('returns documents from the same org', async () => {
      const db = createMockDb()
      const doc = { _id: 'posts:doc1', organizationId: ORG_ID, title: 'Hello' }
      db.get.mockResolvedValue(doc)

      const reader = createScopedReader(asReaderDb(db), ORG_ID, ORG_FIELD, SCOPED_TABLES)
      const result = await reader.get(asId('posts:doc1'))

      expect(result).toEqual(doc)
    })

    it('returns null for documents from different org', async () => {
      const db = createMockDb()
      db.get.mockResolvedValue({ _id: 'posts:doc1', organizationId: OTHER_ORG, title: 'Secret' })

      const reader = createScopedReader(asReaderDb(db), ORG_ID, ORG_FIELD, SCOPED_TABLES)
      const result = await reader.get(asId('posts:doc1'))

      expect(result).toBeNull()
    })

    it('returns null for non-existent documents', async () => {
      const db = createMockDb()
      db.get.mockResolvedValue(null)

      const reader = createScopedReader(asReaderDb(db), ORG_ID, ORG_FIELD, SCOPED_TABLES)
      const result = await reader.get(asId('nonexistent'))

      expect(result).toBeNull()
    })

    it('passes through unscoped table documents even if they have an orgField', async () => {
      const db = createMockDb()
      const doc = { _id: 'users:1', title: 'Public note', organizationId: OTHER_ORG }
      db.get.mockResolvedValue(doc)

      const reader = createScopedReader(asReaderDb(db), ORG_ID, ORG_FIELD, SCOPED_TABLES)
      const result = await reader.get(asId('users:1'))

      expect(result).toEqual(doc)
    })

    it('passes through when normalizeId does not match a scoped table', async () => {
      const db = createMockDb()
      db.normalizeId.mockReturnValue(null)
      const doc = { _id: 'mystery:1', organizationId: OTHER_ORG }
      db.get.mockResolvedValue(doc)

      const reader = createScopedReader(asReaderDb(db), ORG_ID, ORG_FIELD, SCOPED_TABLES)
      const result = await reader.get(asId('mystery:1'))

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
      ).rejects.toThrow(ScopingError)
    })

    it('passes through inserts for unscoped tables', async () => {
      const db = createMockDb()
      db.insert.mockResolvedValue('note_1')
      const writer = createScopedWriter(asWriterDb(db), ORG_ID, ORG_FIELD, SCOPED_TABLES)

      await writer.insert('notes', { title: 'Note' })

      expect(db.insert).toHaveBeenCalledWith('notes', { title: 'Note' })
    })
  })

  describe('patch()', () => {
    it('validates org ownership before patching', async () => {
      const db = createMockDb()
      db.get.mockResolvedValue({ _id: 'posts:doc1', organizationId: ORG_ID, title: 'Old' })

      const writer = createScopedWriter(asWriterDb(db), ORG_ID, ORG_FIELD, SCOPED_TABLES)
      await writer.patch(asId('posts:doc1'), { title: 'New' })

      expect(db.get).toHaveBeenCalledWith('posts:doc1')
      expect(db.patch).toHaveBeenCalledWith('posts:doc1', { title: 'New' })
    })

    it('throws CROSS_ORG_ACCESS for wrong org', async () => {
      const db = createMockDb()
      db.get.mockResolvedValue({ _id: 'posts:doc1', organizationId: OTHER_ORG })

      const writer = createScopedWriter(asWriterDb(db), ORG_ID, ORG_FIELD, SCOPED_TABLES)

      await expect(
        writer.patch(asId('posts:doc1'), { title: 'Hacked' }),
      ).rejects.toThrow(ScopingError)
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
        writer.patch(asId('posts:doc1'), { organizationId: OTHER_ORG }),
      ).rejects.toThrow(ScopingError)
    })

    it('passes through patches for unscoped table ids', async () => {
      const db = createMockDb()
      db.get.mockResolvedValue({ _id: 'users:1', organizationId: OTHER_ORG, role: 'member' })

      const writer = createScopedWriter(asWriterDb(db), ORG_ID, ORG_FIELD, SCOPED_TABLES)
      await writer.patch(asId('users:1'), { role: 'admin' })

      expect(db.patch).toHaveBeenCalledWith('users:1', { role: 'admin' })
    })
  })

  describe('replace()', () => {
    it('validates org ownership and auto-injects orgField', async () => {
      const db = createMockDb()
      db.get.mockResolvedValue({ _id: 'posts:doc1', organizationId: ORG_ID })

      const writer = createScopedWriter(asWriterDb(db), ORG_ID, ORG_FIELD, SCOPED_TABLES)
      await writer.replace(asId('posts:doc1'), { title: 'Replaced' })

      expect(db.replace).toHaveBeenCalledWith('posts:doc1', {
        title: 'Replaced',
        organizationId: ORG_ID,
      })
    })

    it('throws CROSS_ORG_ACCESS for wrong org', async () => {
      const db = createMockDb()
      db.get.mockResolvedValue({ _id: 'posts:doc1', organizationId: OTHER_ORG })

      const writer = createScopedWriter(asWriterDb(db), ORG_ID, ORG_FIELD, SCOPED_TABLES)

      await expect(
        writer.replace(asId('posts:doc1'), { title: 'Hacked' }),
      ).rejects.toThrow(ScopingError)
    })

    it('passes through replaces for unscoped table ids', async () => {
      const db = createMockDb()
      db.get.mockResolvedValue({ _id: 'users:1', organizationId: OTHER_ORG, role: 'member' })

      const writer = createScopedWriter(asWriterDb(db), ORG_ID, ORG_FIELD, SCOPED_TABLES)
      await writer.replace(asId('users:1'), { role: 'admin', organizationId: OTHER_ORG })

      expect(db.replace).toHaveBeenCalledWith('users:1', {
        role: 'admin',
        organizationId: OTHER_ORG,
      })
    })
  })

  describe('delete()', () => {
    it('validates org ownership before deleting', async () => {
      const db = createMockDb()
      db.get.mockResolvedValue({ _id: 'posts:doc1', organizationId: ORG_ID })

      const writer = createScopedWriter(asWriterDb(db), ORG_ID, ORG_FIELD, SCOPED_TABLES)
      await writer.delete(asId('posts:doc1'))

      expect(db.get).toHaveBeenCalledWith('posts:doc1')
      expect(db.delete).toHaveBeenCalledWith('posts:doc1')
    })

    it('throws CROSS_ORG_ACCESS for wrong org', async () => {
      const db = createMockDb()
      db.get.mockResolvedValue({ _id: 'posts:doc1', organizationId: OTHER_ORG })

      const writer = createScopedWriter(asWriterDb(db), ORG_ID, ORG_FIELD, SCOPED_TABLES)

      await expect(
        writer.delete(asId('posts:doc1')),
      ).rejects.toThrow(ScopingError)
    })

    it('throws RESOURCE_NOT_FOUND for missing document', async () => {
      const db = createMockDb()
      db.get.mockResolvedValue(null)

      const writer = createScopedWriter(asWriterDb(db), ORG_ID, ORG_FIELD, SCOPED_TABLES)

      await expect(
        writer.delete(asId('nonexistent')),
      ).rejects.toThrow('Document not found')
    })

    it('passes through deletes for unscoped table ids', async () => {
      const db = createMockDb()
      db.get.mockResolvedValue({ _id: 'users:1', organizationId: OTHER_ORG })

      const writer = createScopedWriter(asWriterDb(db), ORG_ID, ORG_FIELD, SCOPED_TABLES)
      await writer.delete(asId('users:1'))

      expect(db.delete).toHaveBeenCalledWith('users:1')
    })
  })
})
