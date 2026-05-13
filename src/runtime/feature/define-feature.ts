import type { ErasedPermissionDefinition } from '../auth/define-permission.js'
import { isOperationDescriptor, type OperationDescriptor } from '../functions/operation-metadata.js'

export interface FeatureDefinition<
  TName extends string = string,
  TSchema extends Record<string, unknown> = Record<string, never>,
  TPermissions extends readonly ErasedPermissionDefinition[] =
    readonly ErasedPermissionDefinition[],
  TTenantTables extends readonly string[] = readonly string[],
  TSharedTables extends readonly string[] = readonly string[],
  TAccess = unknown,
  TOperations extends readonly OperationDescriptor[] = readonly OperationDescriptor[],
> {
  readonly _type: 'feature'
  readonly name: TName
  readonly schema: TSchema
  readonly permissions: TPermissions
  readonly tenantTables: TTenantTables
  readonly sharedTables: TSharedTables
  readonly recordAccess?: TAccess
  readonly operations?: TOperations
}

export function defineFeature<
  TName extends string,
  TSchema extends Record<string, unknown> = Record<string, never>,
  TPermissions extends readonly ErasedPermissionDefinition[] = readonly [],
  TTenantTables extends readonly string[] = readonly [],
  TSharedTables extends readonly string[] = readonly [],
  TAccess = unknown,
  TOperations extends readonly OperationDescriptor[] = readonly [],
>(definition: {
  name: TName
  schema?: TSchema
  permissions?: TPermissions
  tenantTables?: TTenantTables
  sharedTables?: TSharedTables
  recordAccess?: TAccess
  operations?: TOperations
}): FeatureDefinition<
  TName,
  TSchema,
  TPermissions,
  TTenantTables,
  TSharedTables,
  TAccess,
  TOperations
> {
  if (definition.name.trim().length === 0) {
    throw new Error('defineFeature(...) requires a non-empty feature name.')
  }

  for (const operation of definition.operations ?? []) {
    if (isOperationDescriptor(operation)) continue
    throw new Error(
      `defineFeature(${definition.name}) operations must be shared operation descriptors, not Convex operation implementations.`,
    )
  }

  return {
    _type: 'feature',
    name: definition.name,
    schema: (definition.schema ?? {}) as TSchema,
    permissions: (definition.permissions ?? []) as TPermissions,
    tenantTables: (definition.tenantTables ?? []) as TTenantTables,
    sharedTables: (definition.sharedTables ?? []) as TSharedTables,
    ...(definition.recordAccess !== undefined ? { recordAccess: definition.recordAccess } : {}),
    ...(definition.operations !== undefined ? { operations: definition.operations } : {}),
  }
}
