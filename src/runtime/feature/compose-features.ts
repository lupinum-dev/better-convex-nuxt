import type { ErasedPermissionDefinition } from '../auth/define-permission.js'
import type { FeatureDefinition } from './define-feature.js'

type UnionToIntersection<U> = (U extends unknown ? (arg: U) => void : never) extends (
  arg: infer I,
) => void
  ? I
  : never

type Simplify<T> = { [K in keyof T]: T[K] } & {}

type AnyFeature = FeatureDefinition<
  string,
  Record<string, unknown>,
  readonly ErasedPermissionDefinition[],
  readonly string[],
  readonly string[],
  unknown,
  readonly unknown[]
>

type FeatureSchema<TFeature extends AnyFeature> = TFeature['schema']
type FeaturePermission<TFeature extends AnyFeature> = TFeature['permissions'][number]
type FeatureSchemaTable<TFeature extends AnyFeature> = Extract<
  keyof FeatureSchema<TFeature>,
  string
>
type FeatureTenantTable<TFeature extends AnyFeature> =
  | TFeature['tenantTables'][number]
  | FeatureSchemaTable<TFeature>
type FeatureGlobalTable<TFeature extends AnyFeature> = TFeature['globalTables'][number]

export interface FeatureManifest<
  TSchema extends Record<string, unknown> = Record<string, never>,
  TPermissions extends readonly ErasedPermissionDefinition[] =
    readonly ErasedPermissionDefinition[],
  TTenantTable extends string = string,
  TGlobalTable extends string = string,
> {
  readonly schema: TSchema
  readonly permissions: TPermissions
  readonly tenantTables: readonly TTenantTable[]
  readonly globalTables: readonly TGlobalTable[]
}

function dedupePreservingOrder(values: readonly string[]): string[] {
  const unique: string[] = []
  const seen = new Set<string>()

  for (const value of values) {
    if (seen.has(value)) continue
    seen.add(value)
    unique.push(value)
  }

  return unique
}

function getTableFieldNames(table: unknown): string[] {
  if (!table || typeof table !== 'object') return []

  const validator = (table as { validator?: unknown }).validator
  if (!validator || typeof validator !== 'object') return []

  const fields = (validator as { fields?: unknown }).fields
  if (!fields || typeof fields !== 'object') return []

  return Object.keys(fields as Record<string, unknown>)
}

function getTableIndexNames(table: unknown): string[] {
  if (!table || typeof table !== 'object') return []

  const indexes = (table as { indexes?: unknown }).indexes
  if (!Array.isArray(indexes)) return []

  return indexes.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const name = (entry as { indexDescriptor?: unknown }).indexDescriptor
    return typeof name === 'string' ? [name] : []
  })
}

function deriveTenantTablesFromSchema(
  schema: Record<string, unknown>,
  options: { field?: string; indexName?: string } = {},
): string[] {
  const tenantField = options.field ?? 'workspaceId'
  const tenantIndex = options.indexName ?? 'by_workspace'

  return Object.entries(schema).flatMap(([tableName, table]) => {
    const fields = getTableFieldNames(table)
    const indexes = getTableIndexNames(table)

    return fields.includes(tenantField) && indexes.includes(tenantIndex) ? [tableName] : []
  })
}

export function composeFeatures<const TFeatures extends readonly AnyFeature[]>(
  features: TFeatures,
): FeatureManifest<
  Simplify<UnionToIntersection<FeatureSchema<TFeatures[number]>>>,
  readonly FeaturePermission<TFeatures[number]>[],
  FeatureTenantTable<TFeatures[number]>,
  FeatureGlobalTable<TFeatures[number]>
> {
  const seenFeatureNames = new Set<string>()
  const seenSchemaKeys = new Map<string, string>()
  const seenPermissionKeys = new Map<string, string>()
  const schema: Record<string, unknown> = {}
  const permissions: ErasedPermissionDefinition[] = []
  const tenantTableOverrides: string[] = []
  const globalTables: string[] = []

  for (const feature of features) {
    if (seenFeatureNames.has(feature.name)) {
      throw new Error(`composeFeatures(...) received duplicate feature name "${feature.name}".`)
    }
    seenFeatureNames.add(feature.name)

    for (const [schemaKey, schemaValue] of Object.entries(feature.schema)) {
      const owner = seenSchemaKeys.get(schemaKey)
      if (owner) {
        throw new Error(
          `composeFeatures(...) received duplicate schema key "${schemaKey}" from features "${owner}" and "${feature.name}".`,
        )
      }

      seenSchemaKeys.set(schemaKey, feature.name)
      schema[schemaKey] = schemaValue
    }

    for (const permission of feature.permissions) {
      const owner = seenPermissionKeys.get(permission.key)
      if (owner) {
        throw new Error(
          `composeFeatures(...) received duplicate permission key "${permission.key}" from features "${owner}" and "${feature.name}".`,
        )
      }

      seenPermissionKeys.set(permission.key, feature.name)
      permissions.push(permission)
    }

    tenantTableOverrides.push(...feature.tenantTables)
    globalTables.push(...feature.globalTables)
  }

  const uniqueGlobalTables = dedupePreservingOrder(globalTables)
  const uniqueTenantOverrides = dedupePreservingOrder(tenantTableOverrides)
  const derivedTenantTables = deriveTenantTablesFromSchema(schema)
  const uniqueTenantTables = dedupePreservingOrder([
    ...derivedTenantTables,
    ...uniqueTenantOverrides,
  ]).filter((table) => !uniqueGlobalTables.includes(table))

  for (const table of uniqueTenantOverrides) {
    if (uniqueGlobalTables.includes(table)) {
      throw new Error(
        `composeFeatures(...) classified table "${table}" as both tenant-scoped and global.`,
      )
    }
  }

  return {
    schema: schema as Simplify<UnionToIntersection<FeatureSchema<TFeatures[number]>>>,
    permissions: permissions as readonly FeaturePermission<TFeatures[number]>[],
    tenantTables: uniqueTenantTables as readonly FeatureTenantTable<TFeatures[number]>[],
    globalTables: uniqueGlobalTables as readonly FeatureGlobalTable<TFeatures[number]>[],
  }
}
