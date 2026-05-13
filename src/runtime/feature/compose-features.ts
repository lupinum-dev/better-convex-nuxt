import type { ErasedPermissionDefinition } from '../auth/define-permission.js'
import {
  getOperationMetadata,
  isOperationDescriptor,
  type McpWriteSafety,
  type OperationDescriptor,
} from '../functions/operation-metadata.js'
import type { Expand, UnionToIntersection } from '../types/type-utils.js'
import type { FeatureDefinition } from './define-feature.js'

type AnyFeature = FeatureDefinition<
  string,
  Record<string, unknown>,
  readonly ErasedPermissionDefinition[],
  readonly string[],
  readonly string[],
  unknown,
  readonly OperationDescriptor[]
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
type FeatureGlobalTable<TFeature extends AnyFeature> = TFeature['sharedTables'][number]
type FeatureOperation<TFeature extends AnyFeature> = NonNullable<TFeature['operations']>[number]
type ComposedFeatureSchema<TFeatures extends readonly AnyFeature[]> = Expand<
  UnionToIntersection<FeatureSchema<TFeatures[number]>> & Record<string, unknown>
>

export interface FeatureManifest<
  TSchema extends Record<string, unknown> = Record<string, never>,
  TPermissions extends readonly ErasedPermissionDefinition[] =
    readonly ErasedPermissionDefinition[],
  TTenantTable extends string = string,
  TGlobalTable extends string = string,
  TOperations extends readonly OperationDescriptor[] = readonly OperationDescriptor[],
> {
  readonly schema: TSchema
  readonly permissions: TPermissions
  readonly tenantTables: readonly TTenantTable[]
  readonly sharedTables: readonly TGlobalTable[]
  readonly operations: TOperations
}

export interface AppInventory<
  TFeatures extends readonly AnyFeature[] = readonly AnyFeature[],
  TSchema extends Record<string, unknown> = Record<string, never>,
  TPermissions extends readonly ErasedPermissionDefinition[] =
    readonly ErasedPermissionDefinition[],
  TTenantTable extends string = string,
  TGlobalTable extends string = string,
  TOperations extends readonly OperationDescriptor[] = readonly OperationDescriptor[],
> {
  readonly _type: 'app-inventory'
  readonly schemaVersion: 1
  readonly features: TFeatures
  readonly manifest: FeatureManifest<TSchema, TPermissions, TTenantTable, TGlobalTable, TOperations>
}

export interface AppInventoryJson {
  readonly schemaVersion: 1
  readonly layers: readonly string[]
  readonly features: readonly string[]
  readonly operations: readonly {
    id: string
    name?: string
    kind: string
    feature: string
    permissionKey?: string
    safety?: McpWriteSafety
  }[]
  readonly findings: readonly unknown[]
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
  ComposedFeatureSchema<TFeatures>,
  readonly FeaturePermission<TFeatures[number]>[],
  FeatureTenantTable<TFeatures[number]>,
  FeatureGlobalTable<TFeatures[number]>,
  readonly FeatureOperation<TFeatures[number]>[]
> {
  const seenFeatureNames = new Set<string>()
  const seenSchemaKeys = new Map<string, string>()
  const seenPermissionKeys = new Map<string, string>()
  const schema: Record<string, unknown> = {}
  const permissions: ErasedPermissionDefinition[] = []
  const operations: unknown[] = []
  const tenantTableOverrides: string[] = []
  const sharedTables: string[] = []
  const seenOperationIds = new Map<string, string>()

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

    for (const operation of feature.operations ?? []) {
      if (!isOperationDescriptor(operation)) {
        throw new Error(
          `composeFeatures(...) received non-descriptor operation from feature "${feature.name}".`,
        )
      }

      const metadata = getOperationMetadata(operation as never)
      if (!metadata.id) {
        operations.push(operation)
        continue
      }

      const owner = seenOperationIds.get(metadata.id)
      if (owner) {
        throw new Error(
          `composeFeatures(...) received duplicate operation id "${metadata.id}" from features "${owner}" and "${feature.name}".`,
        )
      }

      seenOperationIds.set(metadata.id, feature.name)
      operations.push(operation)
    }

    tenantTableOverrides.push(...feature.tenantTables)
    sharedTables.push(...feature.sharedTables)
  }

  const uniqueSharedTables = dedupePreservingOrder(sharedTables)
  const uniqueTenantOverrides = dedupePreservingOrder(tenantTableOverrides)
  const derivedTenantTables = deriveTenantTablesFromSchema(schema)
  const uniqueTenantTables = dedupePreservingOrder([
    ...derivedTenantTables,
    ...uniqueTenantOverrides,
  ]).filter((table) => !uniqueSharedTables.includes(table))

  for (const table of uniqueTenantOverrides) {
    if (uniqueSharedTables.includes(table)) {
      throw new Error(
        `composeFeatures(...) classified table "${table}" as both tenant-scoped and global.`,
      )
    }
  }

  return {
    schema: schema as ComposedFeatureSchema<TFeatures>,
    permissions: permissions as readonly FeaturePermission<TFeatures[number]>[],
    tenantTables: uniqueTenantTables as readonly FeatureTenantTable<TFeatures[number]>[],
    sharedTables: uniqueSharedTables as readonly FeatureGlobalTable<TFeatures[number]>[],
    operations: operations as readonly FeatureOperation<TFeatures[number]>[],
  }
}

export function defineAppInventory<const TFeatures extends readonly AnyFeature[]>(definition: {
  features: TFeatures
}): AppInventory<
  TFeatures,
  ComposedFeatureSchema<TFeatures>,
  readonly FeaturePermission<TFeatures[number]>[],
  FeatureTenantTable<TFeatures[number]>,
  FeatureGlobalTable<TFeatures[number]>,
  readonly FeatureOperation<TFeatures[number]>[]
> {
  return {
    _type: 'app-inventory',
    schemaVersion: 1,
    features: definition.features,
    manifest: composeFeatures(definition.features),
  }
}

export function toAppInventoryJson(inventory: AppInventory): AppInventoryJson {
  const operations: AppInventoryJson['operations'] = inventory.features.flatMap((feature) =>
    (feature.operations ?? []).flatMap((operation) => {
      const metadata = getOperationMetadata(operation as never)
      return metadata.id
        ? [
            {
              id: metadata.id,
              ...(metadata.name ? { name: metadata.name } : {}),
              kind: metadata.kind,
              feature: feature.name,
              ...(metadata.permissionKey ? { permissionKey: metadata.permissionKey } : {}),
              ...(metadata.safety ? { safety: metadata.safety } : {}),
            },
          ]
        : []
    }),
  )

  return {
    schemaVersion: 1,
    layers: [],
    features: inventory.features.map((feature) => feature.name),
    operations,
    findings: [],
  }
}
