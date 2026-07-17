/*
 * Adapted from get-convex/better-auth at
 * c628916b451a6b4cff0f5464f134475464b1a6da (Apache-2.0).
 * Rewritten to retain logical IDs, canonical nullability, explicit indexes,
 * ordered compound indexes, and a deterministic adapter metadata descriptor.
 */
import type { BetterAuthDBSchema, DBFieldAttribute } from 'better-auth/db'

import type {
  AuthFieldKind,
  AuthFieldMetadata,
  AuthIndexMetadata,
  AuthModelMetadata,
  AuthSchemaMetadata,
} from './metadata'

export interface GeneratedAuthSchemaArtifacts {
  metadata: AuthSchemaMetadata
  metadataCode: string
  schemaCode: string
}

const explicitIndexes: Readonly<Record<string, readonly (string | readonly string[])[]>> = {
  account: ['accountId', ['accountId', 'providerId'], ['providerId', 'userId']],
  oauthConsent: [['clientId', 'userId']],
  rateLimit: ['key'],
  session: ['expiresAt', ['userId', 'expiresAt']],
  verification: ['expiresAt', 'identifier', ['identifier', 'createdAt']],
}
const FNV64_OFFSET_BASIS = 14_695_981_039_346_656_037n
const FNV64_PRIME = 1_099_511_628_211n

function physicalFieldName(logicalName: string, field: DBFieldAttribute): string {
  return field.fieldName ?? logicalName
}

function fieldKind(field: DBFieldAttribute): AuthFieldKind {
  const kind = field.type as AuthFieldKind
  if (
    kind !== 'string' &&
    kind !== 'number' &&
    kind !== 'boolean' &&
    kind !== 'date' &&
    kind !== 'json' &&
    kind !== 'string[]' &&
    kind !== 'number[]'
  ) {
    throw new Error(`AUTH_SCHEMA_UNSUPPORTED_FIELD_TYPE:${String(field.type)}`)
  }
  return kind
}

function validatorForKind(kind: AuthFieldKind): string {
  switch (kind) {
    case 'string':
    case 'json':
      return 'v.string()'
    case 'number':
    case 'date':
      return 'v.number()'
    case 'boolean':
      return 'v.boolean()'
    case 'string[]':
      return 'v.array(v.string())'
    case 'number[]':
      return 'v.array(v.number())'
  }
}

function descriptorFor(fields: readonly string[]): string {
  if (fields.length === 0) throw new Error('AUTH_SCHEMA_EMPTY_INDEX')
  return fields.join('_')
}

function buildIndexes(
  logicalModelName: string,
  fields: Readonly<Record<string, AuthFieldMetadata>>,
): AuthIndexMetadata[] {
  const indexes: AuthIndexMetadata[] = []
  const seenDescriptors = new Set<string>()
  const seenFields = new Set<string>()

  const add = (logicalFields: readonly string[]) => {
    const physicalFields = logicalFields.map((logicalField) => {
      const field = Object.values(fields).find(
        (candidate) => candidate.logicalName === logicalField,
      )
      if (!field)
        throw new Error(`AUTH_SCHEMA_INDEX_UNKNOWN_FIELD:${logicalModelName}.${logicalField}`)
      return field.physicalName
    })
    const fieldKey = JSON.stringify(physicalFields)
    if (seenFields.has(fieldKey)) return
    const descriptor = descriptorFor(physicalFields)
    if (seenDescriptors.has(descriptor)) {
      throw new Error(`AUTH_SCHEMA_INDEX_NAME_COLLISION:${logicalModelName}.${descriptor}`)
    }
    seenDescriptors.add(descriptor)
    seenFields.add(fieldKey)
    indexes.push({ descriptor, fields: physicalFields })
  }

  add(['id'])
  for (const declared of explicitIndexes[logicalModelName] ?? []) {
    add(typeof declared === 'string' ? [declared] : declared)
  }
  for (const field of Object.values(fields)) {
    if (field.indexed || field.unique || field.reference || field.sortable) {
      add([field.logicalName])
    }
  }
  return indexes
}

function buildMetadata(tables: BetterAuthDBSchema): AuthSchemaMetadata {
  const models: Record<string, AuthModelMetadata> = {}
  for (const [logicalModelName, table] of Object.entries(tables)) {
    const physicalModelName = table.modelName
    if (models[physicalModelName]) {
      throw new Error(`AUTH_SCHEMA_DUPLICATE_MODEL:${physicalModelName}`)
    }

    const fields: Record<string, AuthFieldMetadata> = {
      id: {
        logicalName: 'id',
        physicalName: 'id',
        kind: 'string',
        nullable: false,
        required: true,
        indexed: true,
        selectable: true,
        sortable: false,
        unique: true,
        updatable: false,
      },
    }

    for (const [logicalFieldName, rawField] of Object.entries(table.fields)) {
      if (logicalFieldName === 'id') continue
      const field = rawField as DBFieldAttribute
      const physicalName = physicalFieldName(logicalFieldName, field)
      if (fields[physicalName]) {
        throw new Error(`AUTH_SCHEMA_DUPLICATE_FIELD:${physicalModelName}.${physicalName}`)
      }
      fields[physicalName] = {
        logicalName: logicalFieldName,
        physicalName,
        kind: fieldKind(field),
        nullable: field.required !== true,
        required: field.required === true,
        indexed: field.index === true,
        selectable: true,
        sortable: field.sortable === true,
        unique: field.unique === true,
        updatable: true,
        ...(field.references
          ? {
              reference: {
                model: field.references.model,
                field: field.references.field,
                ...(field.references.onDelete ? { onDelete: field.references.onDelete } : {}),
              },
            }
          : {}),
      }
    }

    models[physicalModelName] = {
      logicalName: logicalModelName,
      physicalName: physicalModelName,
      fields,
      indexes: buildIndexes(logicalModelName, fields),
    }
  }
  return { fingerprint: fingerprintModels(models), models }
}

function fingerprintModels(models: AuthSchemaMetadata['models']): string {
  let hash = FNV64_OFFSET_BASIS
  for (const codeUnit of JSON.stringify(models)) {
    hash ^= BigInt(codeUnit.charCodeAt(0))
    hash = BigInt.asUintN(64, hash * FNV64_PRIME)
  }
  return `bcn-auth-schema-v1:${hash.toString(16).padStart(16, '0')}`
}

function renderMetadata(metadata: AuthSchemaMetadata): string {
  return [
    '/** This file is generated by Better Convex Nuxt. Do not edit. */',
    `const schemaMetadata = ${JSON.stringify(metadata, null, 2)} as const`,
    '',
    'export default schemaMetadata',
    '',
  ].join('\n')
}

function renderSchema(metadata: AuthSchemaMetadata): string {
  const models = Object.values(metadata.models)
  const renderedModels = models.map((model) => {
    const fields = Object.values(model.fields)
      .map((field) => {
        const validator = validatorForKind(field.kind)
        return `    ${JSON.stringify(field.physicalName)}: ${field.nullable ? `v.union(v.null(), ${validator})` : validator},`
      })
      .join('\n')
    const indexes = model.indexes
      .map(
        (index) =>
          `\n    .index(${JSON.stringify(index.descriptor)}, ${JSON.stringify(index.fields)})`,
      )
      .join('')
    return `  ${JSON.stringify(model.physicalName)}: defineTable({\n${fields}\n  })${indexes},`
  })

  return [
    '/** This file is generated by Better Convex Nuxt. Do not edit. */',
    "import { defineSchema, defineTable } from 'convex/server'",
    "import { v } from 'convex/values'",
    '',
    'export const tables = {',
    ...renderedModels,
    '} as const',
    '',
    'const schema = defineSchema(tables)',
    `Object.defineProperty(schema, '__betterConvexNuxtAuthSchemaFingerprint', {`,
    `  value: ${JSON.stringify(metadata.fingerprint)},`,
    '})',
    '',
    'export default schema',
    '',
  ].join('\n')
}

export function generateAuthSchemaArtifacts(
  tables: BetterAuthDBSchema,
): GeneratedAuthSchemaArtifacts {
  const metadata = buildMetadata(tables)
  return {
    metadata,
    metadataCode: renderMetadata(metadata),
    schemaCode: renderSchema(metadata),
  }
}

export async function createAuthSchema({
  file,
  tables,
}: {
  file?: string
  tables: BetterAuthDBSchema
}) {
  const artifacts = generateAuthSchemaArtifacts(tables)
  const target = file ?? './schema.ts'
  return {
    code: artifacts.schemaCode,
    path: target,
    overwrite: true,
  }
}
