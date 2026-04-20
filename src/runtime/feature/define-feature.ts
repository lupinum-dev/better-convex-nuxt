import type { ErasedPermissionDefinition } from '../auth/define-permission.js'

export interface FeatureDefinition<
  TName extends string = string,
  TSchema extends Record<string, unknown> = Record<string, never>,
  TPermissions extends readonly ErasedPermissionDefinition[] =
    readonly ErasedPermissionDefinition[],
  TTenantTables extends readonly string[] = readonly string[],
  TGlobalTables extends readonly string[] = readonly string[],
  TCapabilities = unknown,
  TOperations extends readonly unknown[] = readonly unknown[],
> {
  readonly _type: 'feature'
  readonly name: TName
  readonly schema: TSchema
  readonly permissions: TPermissions
  readonly tenantTables: TTenantTables
  readonly globalTables: TGlobalTables
  readonly capabilities?: TCapabilities
  readonly operations?: TOperations
}

export function defineFeature<
  TName extends string,
  TSchema extends Record<string, unknown> = Record<string, never>,
  TPermissions extends readonly ErasedPermissionDefinition[] = readonly [],
  TTenantTables extends readonly string[] = readonly [],
  TGlobalTables extends readonly string[] = readonly [],
  TCapabilities = unknown,
  TOperations extends readonly unknown[] = readonly [],
>(definition: {
  name: TName
  schema?: TSchema
  permissions?: TPermissions
  tenantTables?: TTenantTables
  globalTables?: TGlobalTables
  capabilities?: TCapabilities
  operations?: TOperations
}): FeatureDefinition<
  TName,
  TSchema,
  TPermissions,
  TTenantTables,
  TGlobalTables,
  TCapabilities,
  TOperations
> {
  if (definition.name.trim().length === 0) {
    throw new Error('defineFeature(...) requires a non-empty feature name.')
  }

  return {
    _type: 'feature',
    name: definition.name,
    schema: (definition.schema ?? {}) as TSchema,
    permissions: (definition.permissions ?? []) as TPermissions,
    tenantTables: (definition.tenantTables ?? []) as TTenantTables,
    globalTables: (definition.globalTables ?? []) as TGlobalTables,
    ...(definition.capabilities !== undefined ? { capabilities: definition.capabilities } : {}),
    ...(definition.operations !== undefined ? { operations: definition.operations } : {}),
  }
}
