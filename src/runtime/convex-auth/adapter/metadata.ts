export type AuthFieldKind =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'json'
  | 'string[]'
  | 'number[]'

export interface AuthReferenceMetadata {
  model: string
  field: string
  onDelete?: 'cascade' | 'no action' | 'restrict' | 'set default' | 'set null'
}

export interface AuthFieldMetadata {
  logicalName: string
  physicalName: string
  kind: AuthFieldKind
  nullable: boolean
  required: boolean
  indexed: boolean
  selectable: boolean
  sortable: boolean
  unique: boolean
  updatable: boolean
  reference?: AuthReferenceMetadata
}

export interface AuthIndexMetadata {
  descriptor: string
  fields: readonly string[]
}

export interface AuthModelMetadata {
  logicalName: string
  physicalName: string
  fields: Readonly<Record<string, AuthFieldMetadata>>
  indexes: readonly AuthIndexMetadata[]
}

export interface AuthSchemaMetadata {
  fingerprint: string
  models: Readonly<Record<string, AuthModelMetadata>>
}

const AUTH_SCHEMA_FINGERPRINT_PROPERTY = '__betterConvexNuxtAuthSchemaFingerprint'

interface ExportedValidator {
  type: string
  value?: ExportedValidator | ExportedValidator[] | Record<string, unknown>
}

interface ExportedField {
  fieldType: ExportedValidator
  optional: boolean
}

interface ExportedTable {
  documentType: {
    type: string
    value: Record<string, ExportedField>
  }
  indexes: Array<{ fields: string[]; indexDescriptor: string }>
  searchIndexes: unknown[]
  stagedDbIndexes: unknown[]
  stagedSearchIndexes: unknown[]
  stagedVectorIndexes: unknown[]
  tableName: string
  vectorIndexes: unknown[]
}

interface ExportedSchema {
  tables: ExportedTable[]
}

function mismatch(): never {
  throw new Error('AUTH_SCHEMA_METADATA_MISMATCH')
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function expectedBaseValidator(kind: AuthFieldKind): ExportedValidator {
  switch (kind) {
    case 'string':
    case 'json':
      return { type: 'string' }
    case 'number':
    case 'date':
      return { type: 'number' }
    case 'boolean':
      return { type: 'boolean' }
    case 'string[]':
      return { type: 'array', value: { type: 'string' } }
    case 'number[]':
      return { type: 'array', value: { type: 'number' } }
  }
}

function validatorMatches(field: AuthFieldMetadata, actual: ExportedValidator): boolean {
  const base = expectedBaseValidator(field.kind)
  const expected = field.nullable ? { type: 'union', value: [{ type: 'null' }, base] } : base
  return JSON.stringify(actual) === JSON.stringify(expected)
}

/**
 * Fail at component definition time when generated schema and metadata are not
 * the exact pair produced by one generator run.
 */
export function assertAuthSchemaMatchesMetadata(
  schema: unknown,
  metadata: AuthSchemaMetadata,
): void {
  try {
    if (schema === null || typeof schema !== 'object') mismatch()
    const schemaRecord = schema as Record<string, unknown>
    const exportSchema = schemaRecord.export
    if (
      typeof exportSchema !== 'function' ||
      typeof metadata.fingerprint !== 'string' ||
      metadata.fingerprint.length === 0 ||
      schemaRecord[AUTH_SCHEMA_FINGERPRINT_PROPERTY] !== metadata.fingerprint
    ) {
      mismatch()
    }

    const exported = JSON.parse(exportSchema.call(schema) as string) as ExportedSchema
    if (!exported || !Array.isArray(exported.tables)) mismatch()

    const models = Object.values(metadata.models)
    if (models.length !== exported.tables.length) mismatch()

    const tablesByName = new Map(exported.tables.map((table) => [table.tableName, table]))
    for (const model of models) {
      if (metadata.models[model.physicalName] !== model) mismatch()
      const table = tablesByName.get(model.physicalName)
      if (!table || table.documentType?.type !== 'object') mismatch()
      if (
        table.searchIndexes.length > 0 ||
        table.stagedDbIndexes.length > 0 ||
        table.stagedSearchIndexes.length > 0 ||
        table.vectorIndexes.length > 0 ||
        table.stagedVectorIndexes.length > 0
      ) {
        mismatch()
      }

      const fields = Object.values(model.fields)
      const exportedFields = table.documentType.value
      if (fields.length !== Object.keys(exportedFields).length) mismatch()
      for (const field of fields) {
        if (model.fields[field.physicalName] !== field) mismatch()
        const exportedField = exportedFields[field.physicalName]
        if (
          !exportedField ||
          exportedField.optional !== false ||
          !validatorMatches(field, exportedField.fieldType)
        ) {
          mismatch()
        }
      }

      if (model.indexes.length !== table.indexes.length) mismatch()
      for (const index of model.indexes) {
        const exportedIndex = table.indexes.find(
          (candidate) => candidate.indexDescriptor === index.descriptor,
        )
        if (!exportedIndex || !sameStrings(index.fields, exportedIndex.fields)) mismatch()
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'AUTH_SCHEMA_METADATA_MISMATCH') throw error
    mismatch()
  }
}

export function getAuthModelMetadata(
  metadata: AuthSchemaMetadata,
  model: string,
): AuthModelMetadata {
  const result = metadata.models[model]
  if (!result) throw new Error(`AUTH_MODEL_UNKNOWN:${model}`)
  return result
}

export function getAuthFieldMetadata(
  metadata: AuthSchemaMetadata,
  model: string,
  field: string,
): AuthFieldMetadata {
  const result = getAuthModelMetadata(metadata, model).fields[field]
  if (!result) throw new Error(`AUTH_FIELD_UNKNOWN:${model}.${field}`)
  return result
}
