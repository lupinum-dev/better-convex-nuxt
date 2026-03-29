import type {
  GenericDataModel,
  GenericDatabaseReader,
  GenericDatabaseWriter,
  GenericTableInfo,
  Query,
} from 'convex/server'
import type { GenericId } from 'convex/values'

import { TenantError } from './errors'
import type { ScopedReader, ScopedWriter } from './types'

type IndexRangeBuilder = {
  eq: (field: string, value: string) => unknown
}

type UncheckedIndexedQuery = {
  withIndex: (
    indexName: string,
    indexRange: (builder: IndexRangeBuilder) => unknown,
  ) => Query<GenericTableInfo>
}

type UncheckedReader = {
  query: (table: string) => UncheckedIndexedQuery
}

type UncheckedWriter = UncheckedReader & {
  insert: (table: string, doc: Record<string, unknown>) => Promise<GenericId<string>>
  patch: (id: GenericId<string>, fields: Record<string, unknown>) => Promise<void>
  replace: (id: GenericId<string>, doc: Record<string, unknown>) => Promise<void>
  delete: (id: GenericId<string>) => Promise<void>
}

// ============================================================================
// Helpers
// ============================================================================

function assertScoped(table: string, scopedTables: readonly string[]): void {
  if (!scopedTables.includes(table)) {
    throw new TenantError(
      `Table "${table}" is not in scopedTables. Either add it to your tenant config or use tenant.raw.db for unscoped access.`,
      'TABLE_NOT_SCOPED',
    )
  }
}

function assertOrgOwnership(
  doc: Record<string, unknown>,
  orgField: string,
  orgId: string,
): void {
  if (orgField in doc && doc[orgField] !== orgId) {
    throw new TenantError(
      `Document belongs to a different organization.`,
      'CROSS_ORG_ACCESS',
    )
  }
}

async function getAndValidate(
  db: GenericDatabaseReader<GenericDataModel>,
  id: GenericId<string>,
  orgField: string,
  orgId: string,
): Promise<Record<string, unknown>> {
  const doc = await db.get(id)
  if (!doc) {
    throw new TenantError('Document not found.', 'RESOURCE_NOT_FOUND')
  }
  assertOrgOwnership(doc, orgField, orgId)
  return doc
}

// ============================================================================
// createScopedReader
// ============================================================================

export function createScopedReader(
  db: GenericDatabaseReader<GenericDataModel>,
  orgId: string,
  orgField: string,
  scopedTables: readonly string[],
): ScopedReader {
  const uncheckedDb = db as unknown as UncheckedReader

  return {
    query(table: string) {
      assertScoped(table, scopedTables)
      try {
        return uncheckedDb
          .query(table)
          .withIndex('by_organization', (q) => q.eq(orgField, orgId))
      }
      catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        if (msg.includes('index') || msg.includes('Index')) {
          throw new TenantError(
            `Table "${table}" is in scopedTables but has no index named "by_organization" on field "${orgField}". Add this to your schema:\n\n  ${table}: defineTable({ ... })\n    .index('by_organization', ['${orgField}'])`,
            'MISSING_ORG_INDEX',
            { cause: e },
          )
        }
        throw e
      }
    },

    async get(id: GenericId<string>) {
      const doc = await db.get(id)
      if (!doc) return null

      // If the document has the orgField, validate ownership.
      // Documents from unscoped tables pass through.
      if (orgField in doc && doc[orgField] !== orgId) {
        return null
      }

      return doc
    },
  }
}

// ============================================================================
// createScopedWriter
// ============================================================================

export function createScopedWriter(
  db: GenericDatabaseWriter<GenericDataModel>,
  orgId: string,
  orgField: string,
  scopedTables: readonly string[],
): ScopedWriter {
  const reader = createScopedReader(db, orgId, orgField, scopedTables)
  const uncheckedDb = db as unknown as UncheckedWriter

  return {
    ...reader,

    async insert(table: string, doc: Record<string, unknown>) {
      assertScoped(table, scopedTables)

      // Reject conflicting orgField values
      if (orgField in doc && doc[orgField] !== orgId) {
        throw new TenantError(
          `Cannot insert document with ${orgField} "${doc[orgField]}" — current org is "${orgId}".`,
          'ORG_FIELD_CONFLICT',
        )
      }

      // Auto-inject orgField
      const scopedDoc = { ...doc, [orgField]: orgId }
      return await uncheckedDb.insert(table, scopedDoc)
    },

    async patch(id: GenericId<string>, fields: Record<string, unknown>) {
      // Pre-read to validate org ownership
      await getAndValidate(db, id, orgField, orgId)

      // Reject orgField changes to a different org
      if (orgField in fields && fields[orgField] !== orgId) {
        throw new TenantError(
          `Cannot change ${orgField} to "${fields[orgField]}" — use tenant.raw.db for cross-org transfers.`,
          'ORG_FIELD_CONFLICT',
        )
      }

      await uncheckedDb.patch(id, fields)
    },

    async replace(id: GenericId<string>, doc: Record<string, unknown>) {
      // Pre-read to validate org ownership
      await getAndValidate(db, id, orgField, orgId)

      // Reject conflicting orgField
      if (orgField in doc && doc[orgField] !== orgId) {
        throw new TenantError(
          `Cannot replace document with ${orgField} "${doc[orgField]}" — current org is "${orgId}".`,
          'ORG_FIELD_CONFLICT',
        )
      }

      // Auto-inject orgField
      const scopedDoc = { ...doc, [orgField]: orgId }
      await uncheckedDb.replace(id, scopedDoc)
    },

    async delete(id: GenericId<string>) {
      // Pre-read to validate org ownership
      await getAndValidate(db, id, orgField, orgId)
      await uncheckedDb.delete(id)
    },
  }
}
