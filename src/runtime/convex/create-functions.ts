import {
  mutationGeneric,
  queryGeneric,
  type GenericDataModel,
  type GenericDatabaseReader,
  type GenericDatabaseWriter,
  type GenericMutationCtx,
  type GenericQueryCtx,
} from 'convex/server'
import {
  v,
  type GenericId,
  type ObjectType,
  type PropertyValidators,
} from 'convex/values'

import {
  createRequireActor,
  createResolveActor,
  createTryResolveActor,
} from '../actor/resolve-actor'
import type { Actor, ActorConfig, ArgsWithServiceAuth } from '../actor/types'
import type { CheckPermissionFn } from './define-permissions'
import {
  createScopedReader,
  createScopedWriter,
  resolveScopedTableForId,
} from '../scoping/scoped-db'
import type { ScopedReader, ScopedWriter } from '../scoping/types'

export function defineActorConfig<TCtx = AnyCtx, TRole extends string = string>(
  config: ActorConfig<TCtx, TRole>,
): ActorConfig<TCtx, TRole> {
  return config
}

export interface TableMeta {
  description?: string
  tenant?: {
    scoped: true
    ownerField?: string
  }
}

export interface PermissionsConfig<
  Permission extends string = string,
  Role extends string = string,
> {
  checkPermission: CheckPermissionFn<Permission, Role>
}

export interface CreateFunctionsOptions<
  TSchema extends Record<string, TableMeta | undefined> = Record<never, never>,
  Permission extends string = string,
  Role extends string = string,
  TActorCtx = unknown,
> {
  schema?: TSchema
  permissions?: PermissionsConfig<Permission, Role>
  actor: ActorConfig<TActorCtx, Role>
  tenant?: {
    orgField: string
    orgIdFrom?: 'actor' | 'args'
  }
}

type QueryCtx = GenericQueryCtx<GenericDataModel>
type MutationCtx = GenericMutationCtx<GenericDataModel>
type AnyCtx = QueryCtx | MutationCtx

type QueryDb = GenericDatabaseReader<GenericDataModel>
type MutationDb = GenericDatabaseWriter<GenericDataModel>
type AnyDb = QueryDb | MutationDb

type SchemaMap = Record<string, TableMeta | undefined>
type TableName<TSchema extends SchemaMap> = keyof TSchema & string

type ResourceRef<KnownTableName extends string> =
  | GenericId<string>
  | { table: KnownTableName, id: GenericId<KnownTableName> }

type ServiceActorArgs<Role extends string> = {
  _serviceKey?: string
  _serviceActor?: {
    userId: string
    role: Role
    orgId?: string
  }
}

const serviceAuthArgs = {
  _serviceKey: v.optional(v.string()),
  _serviceActor: v.optional(v.object({
    userId: v.string(),
    role: v.string(),
    orgId: v.optional(v.string()),
  })),
} as const

function stripServiceArgs<TArgs extends Record<string, unknown>>(
  args: TArgs,
): Omit<TArgs, '_serviceKey' | '_serviceActor'> {
  const { _serviceKey: _key, _serviceActor: _actor, ...clean } = args
  return clean as Omit<TArgs, '_serviceKey' | '_serviceActor'>
}

function extractScopedTables<TSchema extends SchemaMap>(
  schema: TSchema | undefined,
): TableName<TSchema>[] {
  if (!schema) return []
  return Object.entries(schema)
    .filter(([, meta]) => meta?.tenant?.scoped === true)
    .map(([tableName]) => tableName as TableName<TSchema>)
}

function extractTableMeta<TSchema extends SchemaMap>(
  schema: TSchema | undefined,
  tableName: TableName<TSchema> | null,
): TableMeta | undefined {
  if (!schema || !tableName) return undefined
  return schema[tableName]
}

function requireOrgId<Role extends string>(
  actor: Actor<Role>,
  args: Record<string, unknown>,
  tenant: NonNullable<CreateFunctionsOptions['tenant']>,
): string {
  const orgId = tenant.orgIdFrom === 'args'
    ? (typeof args[tenant.orgField] === 'string' ? args[tenant.orgField] as string : undefined)
    : actor.orgId

  if (!orgId) {
    throw new Error('Organization membership required.')
  }
  return orgId
}

async function loadResource<TSchema extends SchemaMap>(
  ctx: AnyCtx,
  options: {
    schema: TSchema | undefined
    scopedTables: readonly TableName<TSchema>[]
    tenant: NonNullable<CreateFunctionsOptions['tenant']>
    orgId: string
    resolver: (args: Record<string, unknown>) => ResourceRef<TableName<TSchema>>
    args: Record<string, unknown>
  },
): Promise<Record<string, unknown>> {
  const target = options.resolver(options.args)
  const id = typeof target === 'object' && target !== null && 'id' in target ? target.id : target
  const explicitTable = typeof target === 'object' && target !== null && 'table' in target
    ? target.table
    : null
  const detectedTable = explicitTable ?? resolveScopedTableForId(ctx.db, id, options.scopedTables)
  const doc = await ctx.db.get(id)

  if (!doc) {
    throw new Error('Resource not found.')
  }

  const tableMeta = extractTableMeta(options.schema, detectedTable)
  if (tableMeta?.tenant?.scoped && options.tenant.orgField in doc) {
    if (doc[options.tenant.orgField] !== options.orgId) {
      throw new Error('Document belongs to a different organization.')
    }
  }

  return doc as Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Context shapes
// ---------------------------------------------------------------------------

type PublicContext<TDb extends AnyDb> = {
  db: TDb
}

type OpenContext<TDb extends AnyDb, Role extends string> = {
  db: TDb
  actor: Actor<Role> | null
}

type AuthedContext<TDb extends AnyDb, Role extends string> = {
  db: TDb
  actor: Actor<Role>
}

type RawContext<TCtx extends AnyCtx, TDb extends AnyDb> = {
  ctx: TCtx
  db: TDb
}

type ScopedContext<TCtx extends AnyCtx, Role extends string, KnownTableName extends string> = {
  db: TCtx extends MutationCtx
    ? ScopedWriter<KnownTableName>
    : ScopedReader<KnownTableName>
  actor: Actor<Role> & { orgId: string }
  raw: RawContext<TCtx, TCtx['db']>
  resource?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Builder option types
// ---------------------------------------------------------------------------

export interface PublicBuilderOptions<ArgsValidator extends PropertyValidators, TCtx extends AnyCtx> {
  args: ArgsValidator
  handler: (
    ctx: PublicContext<TCtx['db']>,
    args: ObjectType<ArgsValidator>,
  ) => Promise<unknown> | unknown
}

export interface OpenBuilderOptions<
  ArgsValidator extends PropertyValidators,
  Role extends string,
  TCtx extends AnyCtx,
> {
  args: ArgsValidator
  handler: (
    ctx: OpenContext<TCtx['db'], Role>,
    args: ObjectType<ArgsValidator>,
  ) => Promise<unknown> | unknown
}

export interface AuthedBuilderOptions<
  ArgsValidator extends PropertyValidators,
  Permission extends string,
  Role extends string,
  TCtx extends AnyCtx,
> {
  args: ArgsValidator
  require?: Permission
  handler: (
    ctx: AuthedContext<TCtx['db'], Role>,
    args: ObjectType<ArgsValidator>,
  ) => Promise<unknown> | unknown
}

export interface ScopedBuilderOptions<
  ArgsValidator extends PropertyValidators,
  Permission extends string,
  Role extends string,
  KnownTableName extends string,
  TCtx extends AnyCtx,
> {
  args: ArgsValidator
  require?: Permission
  resource?: (args: ObjectType<ArgsValidator>) => ResourceRef<KnownTableName>
  handler: (
    ctx: ScopedContext<TCtx, Role, KnownTableName>,
    args: ObjectType<ArgsValidator>,
  ) => Promise<unknown> | unknown
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

type Registrar = typeof queryGeneric | typeof mutationGeneric

export function createFunctions<
  TSchema extends SchemaMap = Record<never, never>,
  Permission extends string = string,
  Role extends string = string,
  TActorCtx = unknown,
>(
  options: CreateFunctionsOptions<TSchema, Permission, Role, TActorCtx>,
) {
  const tryResolveActor = createTryResolveActor(options.actor)
  const resolveActor = createResolveActor(options.actor)
  const requireActor = createRequireActor(options.actor)
  const scopedTables = extractScopedTables(options.schema)
  const tenant = options.tenant ?? {
    orgField: 'organizationId',
    orgIdFrom: 'actor' as const,
  }

  function checkPermission(
    actor: Actor<Role>,
    permission: Permission | undefined,
    resource?: Record<string, unknown>,
  ) {
    if (!permission) return
    if (!options.permissions) {
      throw new Error(`Permission "${permission}" required but no permissions config provided.`)
    }
    const allowed = options.permissions.checkPermission(
      { role: actor.role, userId: actor.userId },
      permission,
      resource,
    )
    if (allowed === false) {
      throw new Error(`Forbidden: ${permission}`)
    }
  }

  // -- Shared handler builders ------------------------------------------------

  function buildPublic<ArgsValidator extends PropertyValidators>(
    registrar: Registrar,
    config: PublicBuilderOptions<ArgsValidator, AnyCtx>,
  ) {
    return registrar({
      args: config.args,
      handler: async (ctx: AnyCtx, args: ObjectType<ArgsValidator>) => {
        return await config.handler({ db: ctx.db }, args)
      },
    })
  }

  function buildOpen<ArgsValidator extends PropertyValidators>(
    registrar: Registrar,
    config: OpenBuilderOptions<ArgsValidator, Role, AnyCtx>,
  ) {
    return registrar({
      args: { ...config.args, ...serviceAuthArgs },
      handler: (async (
        ctx: AnyCtx,
        ...rawArgs: [args?: ObjectType<ArgsValidator> & ServiceActorArgs<Role>]
      ) => {
        const args = (rawArgs[0] ?? {}) as ObjectType<ArgsValidator> & ServiceActorArgs<Role>
        const actor = await tryResolveActor(ctx, args as ArgsWithServiceAuth<Role>)
        return await config.handler(
          { db: ctx.db, actor },
          stripServiceArgs(args as Record<string, unknown>) as ObjectType<ArgsValidator>,
        )
      }) as never,
    })
  }

  function buildAuthed<ArgsValidator extends PropertyValidators>(
    registrar: Registrar,
    config: AuthedBuilderOptions<ArgsValidator, Permission, Role, AnyCtx>,
  ) {
    return registrar({
      args: { ...config.args, ...serviceAuthArgs },
      handler: (async (
        ctx: AnyCtx,
        ...rawArgs: [args?: ObjectType<ArgsValidator> & ServiceActorArgs<Role>]
      ) => {
        const args = (rawArgs[0] ?? {}) as ObjectType<ArgsValidator> & ServiceActorArgs<Role>
        const actor = await resolveActor(ctx, args as ArgsWithServiceAuth<Role>)
        const cleanArgs = stripServiceArgs(args as Record<string, unknown>) as ObjectType<ArgsValidator>
        checkPermission(actor, config.require)
        return await config.handler({ db: ctx.db, actor }, cleanArgs)
      }) as never,
    })
  }

  function buildScoped<ArgsValidator extends PropertyValidators>(
    registrar: Registrar,
    config: ScopedBuilderOptions<ArgsValidator, Permission, Role, TableName<TSchema>, AnyCtx>,
  ) {
    return registrar({
      args: { ...config.args, ...serviceAuthArgs },
      handler: (async (
        ctx: AnyCtx,
        ...rawArgs: [args?: ObjectType<ArgsValidator> & ServiceActorArgs<Role>]
      ) => {
        const args = (rawArgs[0] ?? {}) as ObjectType<ArgsValidator> & ServiceActorArgs<Role>
        const actor = await requireActor(ctx, args as ArgsWithServiceAuth<Role>)
        const cleanArgs = stripServiceArgs(args as Record<string, unknown>) as ObjectType<ArgsValidator>
        const orgId = requireOrgId(actor, cleanArgs as Record<string, unknown>, tenant)

        const resource = config.resource
          ? await loadResource(ctx, {
              schema: options.schema,
              scopedTables,
              tenant,
              orgId,
              resolver: config.resource as (args: Record<string, unknown>) => ResourceRef<TableName<TSchema>>,
              args: cleanArgs as Record<string, unknown>,
            })
          : undefined

        checkPermission(actor, config.require, resource)

        const isMutation = typeof (ctx.db as unknown as Record<string, unknown>).insert === 'function'
        const scopedDb = isMutation
          ? createScopedWriter(ctx.db as GenericDatabaseWriter<GenericDataModel>, orgId, tenant.orgField, scopedTables)
          : createScopedReader(ctx.db, orgId, tenant.orgField, scopedTables)

        return await config.handler({
          db: scopedDb,
          actor: { ...actor, orgId },
          raw: { ctx, db: ctx.db },
          ...(resource ? { resource } : {}),
        } as ScopedContext<AnyCtx, Role, TableName<TSchema>>, cleanArgs)
      }) as never,
    })
  }

  // -- Public API (thin wrappers) ---------------------------------------------

  // The `as never` casts below are safe: the shared build* functions accept
  // AnyCtx internally, but the public wrappers narrow to QueryCtx or MutationCtx
  // for correct handler typing. TypeScript can't unify the contravariant handler
  // parameter, so we cast at the boundary.
  return {
    publicQuery: <A extends PropertyValidators>(config: PublicBuilderOptions<A, QueryCtx>) =>
      buildPublic(queryGeneric, config as never),
    publicMutation: <A extends PropertyValidators>(config: PublicBuilderOptions<A, MutationCtx>) =>
      buildPublic(mutationGeneric, config as never),

    openQuery: <A extends PropertyValidators>(config: OpenBuilderOptions<A, Role, QueryCtx>) =>
      buildOpen(queryGeneric, config as never),
    openMutation: <A extends PropertyValidators>(config: OpenBuilderOptions<A, Role, MutationCtx>) =>
      buildOpen(mutationGeneric, config as never),

    authedQuery: <A extends PropertyValidators>(config: AuthedBuilderOptions<A, Permission, Role, QueryCtx>) =>
      buildAuthed(queryGeneric, config as never),
    authedMutation: <A extends PropertyValidators>(config: AuthedBuilderOptions<A, Permission, Role, MutationCtx>) =>
      buildAuthed(mutationGeneric, config as never),

    scopedQuery: <A extends PropertyValidators>(config: ScopedBuilderOptions<A, Permission, Role, TableName<TSchema>, QueryCtx>) =>
      buildScoped(queryGeneric, config as never),
    scopedMutation: <A extends PropertyValidators>(config: ScopedBuilderOptions<A, Permission, Role, TableName<TSchema>, MutationCtx>) =>
      buildScoped(mutationGeneric, config as never),
  }
}
