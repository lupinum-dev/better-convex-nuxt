import type {
  GenericDataModel,
  GenericDatabaseReader,
  GenericDatabaseWriter,
  GenericTableInfo,
  Query,
} from 'convex/server'
import type { GenericId } from 'convex/values'

import { ScopingError } from './errors'
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

function isScopedTable(table: string, scopedTables: readonly string[]): boolean {
  return scopedTables.includes(table)
}

function assertOrgOwnership(
  doc: Record<string, unknown>,
  orgField: string,
  orgId: string,
): void {
  if (orgField in doc && doc[orgField] !== orgId) {
    throw new ScopingError('Document belongs to a different organization.', 'CROSS_ORG_ACCESS')
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
    throw new ScopingError('Document not found.', 'RESOURCE_NOT_FOUND')
  }
  assertOrgOwnership(doc, orgField, orgId)
  return doc
}

export function createScopedReader(
  db: GenericDatabaseReader<GenericDataModel>,
  orgId: string,
  orgField: string,
  scopedTables: readonly string[],
): ScopedReader {
  const uncheckedDb = db as unknown as UncheckedReader

  return {
    query(table: string) {
      const query = uncheckedDb.query(table)
      if (!isScopedTable(table, scopedTables)) {
        return query as unknown as Query<GenericTableInfo>
      }

      try {
        return query.withIndex('by_organization', (q) => q.eq(orgField, orgId))
      }
      catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        if (message.includes('index') || message.includes('Index')) {
          throw new ScopingError(
            `Table "${table}" is scoped but is missing a "by_organization" index on "${orgField}".`,
            'MISSING_ORG_INDEX',
            { cause: error },
          )
        }
        throw error
      }
    },

    async get(id: GenericId<string>) {
      const doc = await db.get(id)
      if (!doc) return null
      if (orgField in doc && doc[orgField] !== orgId) {
        return null
      }
      return doc
    },
  }
}

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
      if (!isScopedTable(table, scopedTables)) {
        return await uncheckedDb.insert(table, doc)
      }

      if (orgField in doc && doc[orgField] !== orgId) {
        throw new ScopingError(
          `Cannot insert document with ${orgField} "${doc[orgField]}" for org "${orgId}".`,
          'ORG_FIELD_CONFLICT',
        )
      }

      return await uncheckedDb.insert(table, { ...doc, [orgField]: orgId })
    },

    async patch(id: GenericId<string>, fields: Record<string, unknown>) {
      await getAndValidate(db, id, orgField, orgId)

      if (orgField in fields && fields[orgField] !== orgId) {
        throw new ScopingError(
          `Cannot change ${orgField} to "${fields[orgField]}" for org "${orgId}".`,
          'ORG_FIELD_CONFLICT',
        )
      }

      await uncheckedDb.patch(id, fields)
    },

    async replace(id: GenericId<string>, doc: Record<string, unknown>) {
      await getAndValidate(db, id, orgField, orgId)

      if (orgField in doc && doc[orgField] !== orgId) {
        throw new ScopingError(
          `Cannot replace document with ${orgField} "${doc[orgField]}" for org "${orgId}".`,
          'ORG_FIELD_CONFLICT',
        )
      }

      const scopedDoc = orgField in doc ? doc : { ...doc, [orgField]: orgId }
      await uncheckedDb.replace(id, scopedDoc)
    },

    async delete(id: GenericId<string>) {
      await getAndValidate(db, id, orgField, orgId)
      await uncheckedDb.delete(id)
    },
  }
}
