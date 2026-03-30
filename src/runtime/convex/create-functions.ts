import type {
  GenericDataModel,
  GenericDatabaseReader,
  GenericDatabaseWriter,
  GenericMutationCtx,
  GenericQueryCtx,
} from 'convex/server'
import {
  mutationGeneric,
  queryGeneric,
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
import type {
  Actor,
  ActorConfig,
  ArgsWithServiceAuth,
} from '../actor/types'
import type {
  CheckPermissionFn,
  EvaluatePermissionFn,
  PermissionEvaluation,
} from './define-permissions'
import {
  createScopedReader,
  createScopedWriter,
  resolveSchemaTableForId,
} from '../scoping/scoped-db'
import type { ScopedReader, ScopedWriter } from '../scoping/types'

type QueryCtx = GenericQueryCtx<GenericDataModel>
type MutationCtx = GenericMutationCtx<GenericDataModel>
type AnyCtx = QueryCtx | MutationCtx

type QueryDb = GenericDatabaseReader<GenericDataModel>
type MutationDb = GenericDatabaseWriter<GenericDataModel>
type AnyDb = QueryDb | MutationDb

type Registrar = typeof queryGeneric | typeof mutationGeneric

type SchemaTableLike = {
  validator?: unknown
  [' indexes']?: () => Array<{ indexDescriptor?: string; fields?: string[] }>
}

type SchemaLike = {
  tables: Record<string, SchemaTableLike>
}

type TableName<TSchema extends SchemaLike> = keyof TSchema['tables'] & string
type TableOverrides<KnownTableName extends string> = Partial<Record<KnownTableName, {
  ownerField?: string
}>>

type ResourceRef<KnownTableName extends string> =
  | GenericId<string>
  | { table: KnownTableName; id: GenericId<KnownTableName> }

type ServiceActorArgs<Role extends string> = {
  _serviceKey?: string
  _serviceActor?: {
    userId: string
    role: Role
    tenantId?: string
  }
}

const serviceAuthArgs = {
  _serviceKey: v.optional(v.string()),
  _serviceActor: v.optional(v.object({
    userId: v.string(),
    role: v.string(),
    tenantId: v.optional(v.string()),
  })),
} as const

const DEFAULT_TENANT = {
  field: 'organizationId',
  index: 'by_organization',
} as const

const defaultActorConfig: ActorConfig<AnyCtx, string> = {
  resolveFromAuth: async () => null,
}

type LoadedResource<KnownTableName extends string> = {
  doc: Record<string, unknown>
  table: KnownTableName | null
}

function stripServiceArgs<TArgs extends Record<string, unknown>>(
  args: TArgs,
): Omit<TArgs, '_serviceKey' | '_serviceActor'> {
  const { _serviceKey: _key, _serviceActor: _actor, ...clean } = args
  return clean as Omit<TArgs, '_serviceKey' | '_serviceActor'>
}

function defineActorConfig<TCtx = AnyCtx, TRole extends string = string>(
  config: ActorConfig<TCtx, TRole>,
): ActorConfig<TCtx, TRole> {
  return config
}

function getSchemaTableNames<TSchema extends SchemaLike>(
  schema: TSchema | undefined,
): TableName<TSchema>[] {
  if (!schema) return []
  return Object.keys(schema.tables) as TableName<TSchema>[]
}

function getSchemaTable<TSchema extends SchemaLike>(
  schema: TSchema | undefined,
  tableName: TableName<TSchema> | null,
): SchemaTableLike | undefined {
  if (!schema || !tableName) return undefined
  return schema.tables[tableName]
}

function hasTenantField(
  table: SchemaTableLike | undefined,
  field: string,
): boolean {
  if (!table) return false
  const value = (
    table.validator as { json?: { value?: Record<string, unknown> } } | undefined
  )?.json?.value
  return !!value && field in value
}

function hasTenantIndex(
  table: SchemaTableLike | undefined,
  field: string,
  index: string,
): boolean {
  if (!table?.[' indexes']) return false
  return table[' indexes']().some(entry =>
    entry.indexDescriptor === index
    && Array.isArray(entry.fields)
    && entry.fields.length === 1
    && entry.fields[0] === field,
  )
}

function extractScopedTables<TSchema extends SchemaLike>(
  schema: TSchema | undefined,
  tenant: { field: string; index: string },
): TableName<TSchema>[] {
  const tableNames = getSchemaTableNames(schema)
  return tableNames
    .filter((tableName) => {
      const table = getSchemaTable(schema, tableName)
      return hasTenantField(table, tenant.field) && hasTenantIndex(table, tenant.field, tenant.index)
    })
}

function isMutationContext(ctx: AnyCtx): ctx is MutationCtx {
  return typeof (ctx.db as unknown as { insert?: unknown }).insert === 'function'
}

function normalizePermissionResource(
  doc: Record<string, unknown>,
  ownerField: string,
): Record<string, unknown> {
  if (ownerField === 'ownerId') return doc
  if (!(ownerField in doc)) return doc
  return {
    ...doc,
    ownerId: doc[ownerField],
  }
}

function isDevelopmentEnvironment(): boolean {
  return process.env.NODE_ENV !== 'production'
}

function formatDiagnosticValue(value: unknown): string {
  if (value === undefined) return 'undefined'
  return JSON.stringify(value)
}

function formatDiagnosticError(
  heading: string,
  details: Array<[label: string, value: string | undefined]>,
): string {
  if (!isDevelopmentEnvironment()) return heading

  const lines = [heading, '']
  for (const [label, value] of details) {
    if (!value) continue
    lines.push(`  ${label.padEnd(9, ' ')} ${value}`)
  }
  return lines.join('\n')
}

function createOwnershipError<Role extends string>(
  actor: Actor<Role>,
  resource: Record<string, unknown>,
  ownerField: string,
): Error {
  return new Error(formatDiagnosticError(
    'Forbidden: resource ownership',
    [
      ['Actor:', formatDiagnosticValue({
        userId: actor.userId,
        role: actor.role,
        ...(actor.tenantId ? { tenantId: actor.tenantId } : {}),
      })],
      ['Resource:', formatDiagnosticValue(resource)],
      ['Reason:', `${ownerField} (${formatDiagnosticValue(resource[ownerField])}) !== actor.userId (${formatDiagnosticValue(actor.userId)}).`],
      ['Hint:', `This authed handler declared a resource, so only the owning user may access it.`],
    ],
  ))
}

function createPermissionError<Role extends string, Permission extends string>(
  actor: Actor<Role>,
  permission: Permission,
  evaluation: PermissionEvaluation<Permission, Role> | undefined,
  resource?: Record<string, unknown>,
): Error {
  const heading = `Forbidden: ${permission}`
  if (!isDevelopmentEnvironment() || !evaluation) {
    return new Error(heading)
  }

  return new Error(formatDiagnosticError(
    heading,
    [
      ['Actor:', formatDiagnosticValue({
        userId: actor.userId,
        role: actor.role,
        ...(actor.tenantId ? { tenantId: actor.tenantId } : {}),
      })],
      ['Resource:', resource ? formatDiagnosticValue(resource) : undefined],
      ['Rule:', evaluation.rule ? formatDiagnosticValue(evaluation.rule) : undefined],
      ['Reason:', evaluation.reason],
      ['Hint:', evaluation.hint],
    ],
  ))
}

function createResourceNotFoundError(
  id: GenericId<string>,
  table: string | null,
): Error {
  return new Error(formatDiagnosticError(
    'Resource not found.',
    [
      ['Table:', table ?? undefined],
      ['Id:', formatDiagnosticValue(id)],
      ['Hint:', 'Check that the resource exists and that the correct document ID was passed.'],
    ],
  ))
}

function createCrossTenantResourceError(
  doc: Record<string, unknown>,
  tenantField: string,
  tenantId: string,
): Error {
  return new Error(formatDiagnosticError(
    'Document belongs to a different tenant.',
    [
      ['Resource:', formatDiagnosticValue(doc)],
      ['Reason:', `${tenantField} (${formatDiagnosticValue(doc[tenantField])}) !== actor.tenantId (${formatDiagnosticValue(tenantId)}).`],
      ['Hint:', 'Scoped handlers can only operate on resources owned by the current tenant.'],
    ],
  ))
}

function createGuardError(message: string): Error {
  return new Error(message)
}

function getOwnerField<KnownTableName extends string>(
  tables: TableOverrides<KnownTableName> | undefined,
  tableName: KnownTableName | null,
): string {
  if (!tableName) return 'ownerId'
  return tables?.[tableName]?.ownerField ?? 'ownerId'
}

async function loadResource<TSchema extends SchemaLike>(
  ctx: AnyCtx,
  options: {
    schema: TSchema | undefined
    tableNames: readonly TableName<TSchema>[]
    scopedTables: readonly TableName<TSchema>[]
    tenant: { field: string; index: string }
    tenantId?: string
    resolver: (args: Record<string, unknown>) => ResourceRef<TableName<TSchema>>
    args: Record<string, unknown>
  },
): Promise<LoadedResource<TableName<TSchema>>> {
  const target = options.resolver(options.args)
  const id = typeof target === 'object' && target !== null && 'id' in target ? target.id : target
  const explicitTable = typeof target === 'object' && target !== null && 'table' in target
    ? target.table
    : null
  const detectedTable = explicitTable ?? resolveSchemaTableForId(ctx.db, id, options.tableNames)
  const doc = await ctx.db.get(id)

  if (!doc) {
    throw createResourceNotFoundError(id, detectedTable)
  }

  const isScopedTable = detectedTable ? options.scopedTables.includes(detectedTable) : false
  if (isScopedTable && options.tenantId && doc[options.tenant.field] !== options.tenantId) {
    throw createCrossTenantResourceError(
      doc as Record<string, unknown>,
      options.tenant.field,
      options.tenantId,
    )
  }

  return {
    doc: doc as Record<string, unknown>,
    table: detectedTable,
  }
}

type PublicContext<TDb extends AnyDb> = {
  db: TDb
  raw: RawContext<AnyCtx, TDb>
}

type OpenContext<TDb extends AnyDb, Role extends string> = {
  db: TDb
  actor: Actor<Role> | null
  raw: RawContext<AnyCtx, TDb>
}

type AuthedContext<TDb extends AnyDb, Role extends string> = {
  db: TDb
  actor: Actor<Role>
  raw: RawContext<AnyCtx, TDb>
  resource?: Record<string, unknown>
}

type RawContext<TCtx extends AnyCtx, TDb extends AnyDb> = {
  ctx: TCtx
  db: TDb
}

type ScopedContext<TCtx extends AnyCtx, Role extends string, KnownTableName extends string> = {
  db: TCtx extends MutationCtx ? ScopedWriter<KnownTableName> : ScopedReader<KnownTableName>
  actor: Actor<Role> & { tenantId: string }
  raw: RawContext<TCtx, TCtx['db']>
  resource?: Record<string, unknown>
}

// eslint-disable-next-line @typescript-eslint/no-invalid-void-type
type GuardResult = void | string | Promise<void | string>

export interface PermissionsConfig<
  Permission extends string = string,
  Role extends string = string,
> {
  checkPermission: CheckPermissionFn<Permission, Role>
  evaluatePermission?: EvaluatePermissionFn<Permission, Role>
}

export interface CreateFunctionsOptions<
  TSchema extends SchemaLike = { tables: Record<never, never> },
  Permission extends string = string,
  Role extends string = string,
  TActorCtx = AnyCtx,
> {
  schema?: TSchema
  tables?: TableOverrides<TableName<TSchema>>
  permissions?: PermissionsConfig<Permission, Role>
  actor?: ActorConfig<TActorCtx, Role>
  tenant?: {
    field: string
    index: string
  }
}

export interface PublicBuilderOptions<
  ArgsValidator extends PropertyValidators,
  TCtx extends AnyCtx,
> {
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
  KnownTableName extends string,
  TCtx extends AnyCtx,
> {
  args: ArgsValidator
  require?: Permission
  resource?: (args: ObjectType<ArgsValidator>) => ResourceRef<KnownTableName>
  ownerField?: string
  guard?: (
    ctx: AuthedContext<TCtx['db'], Role>,
    args: ObjectType<ArgsValidator>,
  ) => GuardResult
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
  guard?: (
    ctx: ScopedContext<TCtx, Role, KnownTableName>,
    args: ObjectType<ArgsValidator>,
  ) => GuardResult
  handler: (
    ctx: ScopedContext<TCtx, Role, KnownTableName>,
    args: ObjectType<ArgsValidator>,
  ) => Promise<unknown> | unknown
}

export function createFunctions<
  TSchema extends SchemaLike = { tables: Record<never, never> },
  Permission extends string = string,
  Role extends string = string,
  TActorCtx = AnyCtx,
>(
  options?: CreateFunctionsOptions<TSchema, Permission, Role, TActorCtx>,
) {
  const actorConfig = (options?.actor ?? defaultActorConfig) as ActorConfig<TActorCtx, Role>
  const tryResolveActor = createTryResolveActor(actorConfig)
  const resolveActor = createResolveActor(actorConfig)
  const requireActor = createRequireActor(actorConfig)
  const tenant = options?.tenant ?? DEFAULT_TENANT
  const tableNames = getSchemaTableNames(options?.schema)
  const scopedTables = extractScopedTables(options?.schema, tenant)

  function assertPermission(
    actor: Actor<Role>,
    permission: Permission | undefined,
    resource?: Record<string, unknown>,
  ) {
    if (!permission) return
    if (!options?.permissions) {
      throw new Error(`Permission "${permission}" required but no permissions config provided.`)
    }
    const evaluation = options.permissions.evaluatePermission?.(
      {
        role: actor.role,
        userId: actor.userId,
        ...(actor.tenantId ? { tenantId: actor.tenantId } : {}),
      },
      permission,
      resource,
    )
    if (evaluation && evaluation.allowed === false) {
      throw createPermissionError(actor, permission, evaluation, resource)
    }

    const allowed = options.permissions.checkPermission(
      {
        role: actor.role,
        userId: actor.userId,
        ...(actor.tenantId ? { tenantId: actor.tenantId } : {}),
      },
      permission,
      resource,
    )
    if (allowed === false) {
      throw createPermissionError(actor, permission, evaluation, resource)
    }
  }

  function buildPublic<ArgsValidator extends PropertyValidators>(
    registrar: Registrar,
    config: PublicBuilderOptions<ArgsValidator, AnyCtx>,
  ) {
    return registrar({
      args: config.args,
      handler: async (ctx: AnyCtx, args: ObjectType<ArgsValidator>) => {
        return await config.handler({ db: ctx.db, raw: { ctx, db: ctx.db } }, args)
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
          { db: ctx.db, actor, raw: { ctx, db: ctx.db } },
          stripServiceArgs(args as Record<string, unknown>) as ObjectType<ArgsValidator>,
        )
      }) as never,
    })
  }

  function buildAuthed<ArgsValidator extends PropertyValidators>(
    registrar: Registrar,
    config: AuthedBuilderOptions<ArgsValidator, Permission, Role, TableName<TSchema>, AnyCtx>,
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

        const loadedResource = config.resource
          ? await loadResource(ctx, {
              schema: options?.schema,
              tableNames,
              scopedTables,
              tenant,
              resolver: config.resource as (args: Record<string, unknown>) => ResourceRef<TableName<TSchema>>,
              args: cleanArgs as Record<string, unknown>,
            })
          : undefined

        const ownerField = config.ownerField ?? getOwnerField(options?.tables, loadedResource?.table ?? null)
        const permissionResource = loadedResource
          ? normalizePermissionResource(loadedResource.doc, ownerField)
          : undefined

        if (loadedResource && loadedResource.doc[ownerField] !== actor.userId) {
          throw createOwnershipError(actor, loadedResource.doc, ownerField)
        }

        assertPermission(actor, config.require, permissionResource)

        const handlerContext: AuthedContext<AnyCtx['db'], Role> = {
          db: ctx.db,
          actor,
          raw: { ctx, db: ctx.db },
          ...(loadedResource ? { resource: loadedResource.doc } : {}),
        }

        const guardResult = await config.guard?.(handlerContext, cleanArgs)
        if (typeof guardResult === 'string') {
          throw createGuardError(guardResult)
        }

        return await config.handler(
          handlerContext,
          cleanArgs,
        )
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

        const loadedResource = config.resource
          ? await loadResource(ctx, {
              schema: options?.schema,
              tableNames,
              scopedTables,
              tenant,
              tenantId: actor.tenantId,
              resolver: config.resource as (args: Record<string, unknown>) => ResourceRef<TableName<TSchema>>,
              args: cleanArgs as Record<string, unknown>,
            })
          : undefined

        const ownerField = getOwnerField(options?.tables, loadedResource?.table ?? null)
        const permissionResource = loadedResource
          ? normalizePermissionResource(loadedResource.doc, ownerField)
          : undefined

        assertPermission(actor, config.require, permissionResource)

        const scopedDb = isMutationContext(ctx)
          ? createScopedWriter(
              ctx.db as GenericDatabaseWriter<GenericDataModel>,
              actor.tenantId,
              tenant.field,
              tenant.index,
              scopedTables,
            )
          : createScopedReader(
              ctx.db,
              actor.tenantId,
              tenant.field,
              tenant.index,
              scopedTables,
            )

        const handlerContext = {
          db: scopedDb,
          actor,
          raw: { ctx, db: ctx.db },
          ...(loadedResource ? { resource: loadedResource.doc } : {}),
        } as ScopedContext<AnyCtx, Role, TableName<TSchema>>

        const guardResult = await config.guard?.(handlerContext, cleanArgs)
        if (typeof guardResult === 'string') {
          throw createGuardError(guardResult)
        }

        return await config.handler(
          handlerContext,
          cleanArgs,
        )
      }) as never,
    })
  }

  return {
    publicQuery: <A extends PropertyValidators>(config: PublicBuilderOptions<A, QueryCtx>) =>
      buildPublic(queryGeneric, config as never),
    publicMutation: <A extends PropertyValidators>(config: PublicBuilderOptions<A, MutationCtx>) =>
      buildPublic(mutationGeneric, config as never),

    openQuery: <A extends PropertyValidators>(config: OpenBuilderOptions<A, Role, QueryCtx>) =>
      buildOpen(queryGeneric, config as never),
    openMutation: <A extends PropertyValidators>(config: OpenBuilderOptions<A, Role, MutationCtx>) =>
      buildOpen(mutationGeneric, config as never),

    authedQuery: <A extends PropertyValidators>(config: AuthedBuilderOptions<A, Permission, Role, TableName<TSchema>, QueryCtx>) =>
      buildAuthed(queryGeneric, config as never),
    authedMutation: <A extends PropertyValidators>(config: AuthedBuilderOptions<A, Permission, Role, TableName<TSchema>, MutationCtx>) =>
      buildAuthed(mutationGeneric, config as never),

    scopedQuery: <A extends PropertyValidators>(config: ScopedBuilderOptions<A, Permission, Role, TableName<TSchema>, QueryCtx>) =>
      buildScoped(queryGeneric, config as never),
    scopedMutation: <A extends PropertyValidators>(config: ScopedBuilderOptions<A, Permission, Role, TableName<TSchema>, MutationCtx>) =>
      buildScoped(mutationGeneric, config as never),
  }
}

export {
  defineActorConfig,
}
