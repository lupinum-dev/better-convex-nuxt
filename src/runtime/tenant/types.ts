import type {
  GenericDatabaseReader,
  GenericDatabaseWriter,
  GenericQueryCtx,
  GenericMutationCtx,
  Query,
} from 'convex/server'
import type { PropertyValidators, ObjectType, GenericId } from 'convex/values'

import type { CheckPermissionFn, Resource } from '../composables/usePermissions'

// ============================================================================
// Tenant User
// ============================================================================

export interface TenantUser {
  _id: GenericId<string>
  userId: string
  orgId: GenericId<string>
  role: string
  [key: string]: unknown
}

// ============================================================================
// Tenant Config (output of defineTenant)
// ============================================================================

export interface TenantConfig<
  TScopedTables extends string = string,
  TOrgField extends string = string,
> {
  readonly orgField: TOrgField
  readonly scopedTables: readonly TScopedTables[]
  readonly resolveUser: (ctx: GenericQueryCtx<any> | GenericMutationCtx<any>) => Promise<TenantUser | null>
}

// ============================================================================
// Tenant Context (the `tenant` parameter in handlers)
// ============================================================================

export interface TenantContext<
  TPermission extends string = string,
  TResource = unknown,
  TRawCtx extends GenericQueryCtx<any> | GenericMutationCtx<any> =
    GenericQueryCtx<any> | GenericMutationCtx<any>,
  TRawDb extends GenericDatabaseReader<any> | GenericDatabaseWriter<any> =
    GenericDatabaseReader<any> | GenericDatabaseWriter<any>,
> {
  user: TenantUser
  orgId: GenericId<string>
  can: (permission: TPermission, resource?: Resource) => boolean
  owns: (doc: Record<string, unknown> | null) => boolean
  resource: TResource
  raw: {
    ctx: TRawCtx
    db: TRawDb
  }
}

// ============================================================================
// Scoped Database Handles
// ============================================================================

export interface ScopedReader<TScopedTables extends string = string> {
  query: (table: TScopedTables) => Query<any>
  get: <T extends string>(id: GenericId<T>) => Promise<any | null>
}

export interface ScopedWriter<TScopedTables extends string = string> extends ScopedReader<TScopedTables> {
  insert: (table: TScopedTables, doc: Record<string, unknown>) => Promise<GenericId<string>>
  patch: (id: GenericId<string>, fields: Record<string, unknown>) => Promise<void>
  replace: (id: GenericId<string>, doc: Record<string, unknown>) => Promise<void>
  delete: (id: GenericId<string>) => Promise<void>
}

// ============================================================================
// Handler Signatures
// ============================================================================

export type ScopedQueryHandler<
  TArgs,
  TReturn,
  TScopedTables extends string = string,
  TPermission extends string = string,
> = (
  db: ScopedReader<TScopedTables>,
  args: TArgs,
  tenant: TenantContext<
    TPermission,
    undefined,
    GenericQueryCtx<any>,
    GenericDatabaseReader<any>
  >,
) => TReturn | Promise<TReturn>

export type ScopedMutationHandler<
  TArgs,
  TReturn,
  TScopedTables extends string = string,
  TPermission extends string = string,
  TResource = undefined,
> = (
  db: ScopedWriter<TScopedTables>,
  args: TArgs,
  tenant: TenantContext<
    TPermission,
    TResource,
    GenericMutationCtx<any>,
    GenericDatabaseWriter<any>
  >,
) => TReturn | Promise<TReturn>

// ============================================================================
// Config for scopedQuery / scopedMutation definitions
// ============================================================================

export interface ScopedQueryDef<
  TArgs extends PropertyValidators,
  TScopedTables extends string = string,
  TPermission extends string = string,
> {
  args: TArgs
  handler: ScopedQueryHandler<
    ObjectType<TArgs>,
    any,
    TScopedTables,
    TPermission
  >
}

export interface ScopedMutationDef<
  TArgs extends PropertyValidators,
  TScopedTables extends string = string,
  TPermission extends string = string,
  TResource = undefined,
> {
  args: TArgs
  permission?: TPermission
  resource?: (
    db: ScopedReader<TScopedTables>,
    args: ObjectType<TArgs>,
  ) => Promise<(Record<string, unknown> & Resource) | null>
  handler: ScopedMutationHandler<
    ObjectType<TArgs>,
    any,
    TScopedTables,
    TPermission,
    TResource
  >
}

// ============================================================================
// Factory Options
// ============================================================================

export interface CreateTenantHelpersOptions<TPermission extends string = string> {
  checkPermission?: CheckPermissionFn<TPermission>
  query: (...args: any[]) => any
  mutation: (...args: any[]) => any
}
