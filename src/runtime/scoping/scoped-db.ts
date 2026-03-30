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

type UncheckedQuery = Query<GenericTableInfo> & {
  withIndex: (
    indexName: string,
    indexRange: (builder: IndexRangeBuilder) => unknown,
  ) => Query<GenericTableInfo>
}

type UncheckedReader = {
  query: (table: string) => UncheckedQuery
}

type UncheckedWriter = UncheckedReader & {
  insert: (table: string, doc: Record<string, unknown>) => Promise<GenericId<string>>
  patch: (id: GenericId<string>, fields: Record<string, unknown>) => Promise<void>
  replace: (id: GenericId<string>, doc: Record<string, unknown>) => Promise<void>
  delete: (id: GenericId<string>) => Promise<void>
}

function isScopedTable(
  table: string,
  scopedTables: readonly string[],
): boolean {
  return scopedTables.includes(table)
}

export function resolveSchemaTableForId(
  db: GenericDatabaseReader<GenericDataModel>,
  id: GenericId<string>,
  tableNames: readonly string[],
): string | null {
  const idValue = String(id)

  for (const table of tableNames) {
    if (db.normalizeId(table as never, idValue) !== null) {
      return table
    }
  }

  return null
}

function assertTenantOwnership(
  doc: Record<string, unknown>,
  tenantField: string,
  tenantId: string,
): void {
  if (tenantField in doc && doc[tenantField] !== tenantId) {
    throw new ScopingError(
      'Document belongs to a different tenant.',
      'CROSS_ORG_ACCESS',
    )
  }
}

async function getAndValidate(
  db: GenericDatabaseReader<GenericDataModel>,
  id: GenericId<string>,
  scopedTables: readonly string[],
  tenantField: string,
  tenantId: string,
): Promise<{ doc: Record<string, unknown>; scopedTable: string | null }> {
  const scopedTable = resolveSchemaTableForId(db, id, scopedTables)
  const doc = await db.get(id)
  if (!doc) {
    throw new ScopingError('Document not found.', 'RESOURCE_NOT_FOUND')
  }
  if (scopedTable) {
    assertTenantOwnership(doc, tenantField, tenantId)
  }
  return { doc, scopedTable }
}

export function createScopedReader<TableName extends string>(
  db: GenericDatabaseReader<GenericDataModel>,
  tenantId: string,
  tenantField: string,
  tenantIndex: string,
  scopedTables: readonly TableName[],
): ScopedReader<TableName> {
  const uncheckedDb = db as UncheckedReader

  return {
    query(table: TableName | (string & {})) {
      const query = uncheckedDb.query(table)
      if (!isScopedTable(table, scopedTables)) {
        return query
      }

      try {
        return query.withIndex(tenantIndex, q => q.eq(tenantField, tenantId))
      }
      catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        if (message.includes('index') || message.includes('Index')) {
          throw new ScopingError(
            `Table "${table}" is scoped but is missing a "${tenantIndex}" index on "${tenantField}".`,
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
      const scopedTable = resolveSchemaTableForId(db, id, scopedTables)
      if (scopedTable && tenantField in doc && doc[tenantField] !== tenantId) {
        return null
      }
      return doc
    },
  }
}

export function createScopedWriter<TableName extends string>(
  db: GenericDatabaseWriter<GenericDataModel>,
  tenantId: string,
  tenantField: string,
  tenantIndex: string,
  scopedTables: readonly TableName[],
): ScopedWriter<TableName> {
  const reader = createScopedReader(db, tenantId, tenantField, tenantIndex, scopedTables)
  const uncheckedDb = db as UncheckedWriter

  return {
    ...reader,

    async insert(
      table: TableName | (string & {}),
      doc: Record<string, unknown>,
    ) {
      if (!isScopedTable(table, scopedTables)) {
        return await uncheckedDb.insert(table, doc)
      }

      if (tenantField in doc && doc[tenantField] !== tenantId) {
        throw new ScopingError(
          `Cannot insert document with ${tenantField} "${doc[tenantField]}" for tenant "${tenantId}".`,
          'ORG_FIELD_CONFLICT',
        )
      }

      return await uncheckedDb.insert(table, { ...doc, [tenantField]: tenantId })
    },

    async patch(id: GenericId<string>, fields: Record<string, unknown>) {
      const { scopedTable } = await getAndValidate(
        db,
        id,
        scopedTables,
        tenantField,
        tenantId,
      )

      if (scopedTable && tenantField in fields && fields[tenantField] !== tenantId) {
        throw new ScopingError(
          `Cannot change ${tenantField} to "${fields[tenantField]}" for tenant "${tenantId}".`,
          'ORG_FIELD_CONFLICT',
        )
      }

      await uncheckedDb.patch(id, fields)
    },

    async replace(id: GenericId<string>, doc: Record<string, unknown>) {
      const { scopedTable } = await getAndValidate(
        db,
        id,
        scopedTables,
        tenantField,
        tenantId,
      )

      if (scopedTable && tenantField in doc && doc[tenantField] !== tenantId) {
        throw new ScopingError(
          `Cannot replace document with ${tenantField} "${doc[tenantField]}" for tenant "${tenantId}".`,
          'ORG_FIELD_CONFLICT',
        )
      }

      await uncheckedDb.replace(
        id,
        scopedTable && !(tenantField in doc) ? { ...doc, [tenantField]: tenantId } : doc,
      )
    },

    async delete(id: GenericId<string>) {
      await getAndValidate(db, id, scopedTables, tenantField, tenantId)
      await uncheckedDb.delete(id)
    },
  }
}
