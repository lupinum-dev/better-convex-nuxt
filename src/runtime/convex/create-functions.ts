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
import {
  createScopedReader,
  createScopedWriter,
} from '../scoping/scoped-db'

export type DefineActorConfig<TConfig extends ActorConfig = ActorConfig> = TConfig

export function defineActorConfig<TConfig extends ActorConfig>(
  config: TConfig,
): DefineActorConfig<TConfig> {
  return config
}

export interface TableMeta {
  description?: string
  tenant?: {
    scoped: true
    ownerField?: string
  }
}

export interface PermissionsConfig<Permission extends string = string> {
  checkPermission: (
    ctx: { role: string, userId: string } | null,
    permission: Permission,
    resource?: { ownerId?: string, [key: string]: unknown },
  ) => boolean
}

export interface CreateFunctionsOptions<Permission extends string = string> {
  schema?: Record<string, TableMeta | undefined>
  permissions?: PermissionsConfig<Permission>
  actor: ActorConfig
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

type ResourceRef = GenericId<string> | { table: string, id: GenericId<string> }

type ServiceActorArgs = {
  _serviceKey?: string
  _serviceActor?: {
    userId: string
    role: string
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

function extractScopedTables(
  schema: Record<string, TableMeta | undefined> | undefined,
): string[] {
  if (!schema) return []
  return Object.entries(schema)
    .filter(([, meta]) => meta?.tenant?.scoped === true)
    .map(([tableName]) => tableName)
}

function extractTableMeta(
  schema: Record<string, TableMeta | undefined> | undefined,
  tableName: string | null,
): TableMeta | undefined {
  if (!schema || !tableName) return undefined
  return schema[tableName]
}

function resolveScopedTableForId(
  db: GenericDatabaseReader<GenericDataModel>,
  id: GenericId<string>,
  scopedTables: readonly string[],
): string | null {
  const rawId = String(id)
  for (const table of scopedTables) {
    if (db.normalizeId(table as never, rawId) !== null) {
      return table
    }
  }
  return null
}

function resolveOrgId(
  actor: Actor,
  args: Record<string, unknown>,
  tenant: NonNullable<CreateFunctionsOptions['tenant']>,
): string | undefined {
  if (tenant.orgIdFrom === 'args') {
    const fromArgs = args[tenant.orgField]
    return typeof fromArgs === 'string' ? fromArgs : undefined
  }

  return actor.orgId
}

async function loadResource(
  ctx: AnyCtx,
  options: {
    schema: Record<string, TableMeta | undefined> | undefined
    scopedTables: readonly string[]
    tenant: NonNullable<CreateFunctionsOptions['tenant']>
    orgId: string
    resolver: (args: Record<string, unknown>) => ResourceRef
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

type PublicContext<TDb extends AnyDb> = {
  db: TDb
}

type OpenContext<TDb extends AnyDb> = {
  db: TDb
  actor: Actor | null
}

type AuthedContext<TDb extends AnyDb> = {
  db: TDb
  actor: Actor
}

type RawContext<TCtx extends AnyCtx, TDb extends AnyDb> = {
  ctx: TCtx
  db: TDb
}

type ScopedContext<TCtx extends AnyCtx> = {
  db: TCtx extends MutationCtx
    ? ReturnType<typeof createScopedWriter>
    : ReturnType<typeof createScopedReader>
  actor: Actor & { orgId: string }
  raw: RawContext<TCtx, TCtx['db']>
  resource?: Record<string, unknown>
}

export interface PublicBuilderOptions<ArgsValidator extends PropertyValidators, TCtx extends AnyCtx> {
  args: ArgsValidator
  handler: (
    ctx: PublicContext<TCtx['db']>,
    args: ObjectType<ArgsValidator>,
  ) => Promise<unknown> | unknown
}

export interface OpenBuilderOptions<ArgsValidator extends PropertyValidators, TCtx extends AnyCtx> {
  args: ArgsValidator
  handler: (
    ctx: OpenContext<TCtx['db']>,
    args: ObjectType<ArgsValidator>,
  ) => Promise<unknown> | unknown
}

export interface AuthedBuilderOptions<
  ArgsValidator extends PropertyValidators,
  Permission extends string,
  TCtx extends AnyCtx,
> {
  args: ArgsValidator
  require?: Permission
  handler: (
    ctx: AuthedContext<TCtx['db']>,
    args: ObjectType<ArgsValidator>,
  ) => Promise<unknown> | unknown
}

export interface ScopedBuilderOptions<
  ArgsValidator extends PropertyValidators,
  Permission extends string,
  TCtx extends AnyCtx,
> {
  args: ArgsValidator
  require?: Permission
  resource?: (args: ObjectType<ArgsValidator>) => ResourceRef
  handler: (
    ctx: ScopedContext<TCtx>,
    args: ObjectType<ArgsValidator>,
  ) => Promise<unknown> | unknown
}

export function createFunctions<Permission extends string = string>(
  options: CreateFunctionsOptions<Permission>,
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
    actor: Actor,
    permission: Permission | undefined,
    resource?: Record<string, unknown>,
  ) {
    if (!permission) return
    const allowed = options.permissions?.checkPermission(
      { role: actor.role, userId: actor.userId },
      permission,
      resource,
    )
    if (allowed === false) {
      throw new Error(`Forbidden: ${permission}`)
    }
  }

  function publicQuery<ArgsValidator extends PropertyValidators>(
    config: PublicBuilderOptions<ArgsValidator, QueryCtx>,
  ) {
    return queryGeneric({
      args: config.args,
      handler: async (ctx: QueryCtx, args: ObjectType<ArgsValidator>) => {
        return await config.handler({ db: ctx.db }, args)
      },
    })
  }

  function publicMutation<ArgsValidator extends PropertyValidators>(
    config: PublicBuilderOptions<ArgsValidator, MutationCtx>,
  ) {
    return mutationGeneric({
      args: config.args,
      handler: async (ctx: MutationCtx, args: ObjectType<ArgsValidator>) => {
        return await config.handler({ db: ctx.db }, args)
      },
    })
  }

  function openQuery<ArgsValidator extends PropertyValidators>(
    config: OpenBuilderOptions<ArgsValidator, QueryCtx>,
  ) {
    return queryGeneric({
      args: { ...config.args, ...serviceAuthArgs },
      handler: (async (
        ctx: QueryCtx,
        ...rawArgs: [args?: ObjectType<ArgsValidator> & ServiceActorArgs]
      ) => {
        const args = (rawArgs[0] ?? {}) as ObjectType<ArgsValidator> & ServiceActorArgs
        const actor = await tryResolveActor(ctx, args as ArgsWithServiceAuth)
        return await config.handler(
          { db: ctx.db, actor },
          stripServiceArgs(args as Record<string, unknown>) as ObjectType<ArgsValidator>,
        )
      }) as never,
    })
  }

  function openMutation<ArgsValidator extends PropertyValidators>(
    config: OpenBuilderOptions<ArgsValidator, MutationCtx>,
  ) {
    return mutationGeneric({
      args: { ...config.args, ...serviceAuthArgs },
      handler: (async (
        ctx: MutationCtx,
        ...rawArgs: [args?: ObjectType<ArgsValidator> & ServiceActorArgs]
      ) => {
        const args = (rawArgs[0] ?? {}) as ObjectType<ArgsValidator> & ServiceActorArgs
        const actor = await tryResolveActor(ctx, args as ArgsWithServiceAuth)
        return await config.handler(
          { db: ctx.db, actor },
          stripServiceArgs(args as Record<string, unknown>) as ObjectType<ArgsValidator>,
        )
      }) as never,
    })
  }

  function authedQuery<ArgsValidator extends PropertyValidators>(
    config: AuthedBuilderOptions<ArgsValidator, Permission, QueryCtx>,
  ) {
    return queryGeneric({
      args: { ...config.args, ...serviceAuthArgs },
      handler: (async (
        ctx: QueryCtx,
        ...rawArgs: [args?: ObjectType<ArgsValidator> & ServiceActorArgs]
      ) => {
        const args = (rawArgs[0] ?? {}) as ObjectType<ArgsValidator> & ServiceActorArgs
        const actor = await resolveActor(ctx, args as ArgsWithServiceAuth)
        const cleanArgs = stripServiceArgs(args as Record<string, unknown>) as ObjectType<ArgsValidator>
        checkPermission(actor, config.require)
        return await config.handler({ db: ctx.db, actor }, cleanArgs)
      }) as never,
    })
  }

  function authedMutation<ArgsValidator extends PropertyValidators>(
    config: AuthedBuilderOptions<ArgsValidator, Permission, MutationCtx>,
  ) {
    return mutationGeneric({
      args: { ...config.args, ...serviceAuthArgs },
      handler: (async (
        ctx: MutationCtx,
        ...rawArgs: [args?: ObjectType<ArgsValidator> & ServiceActorArgs]
      ) => {
        const args = (rawArgs[0] ?? {}) as ObjectType<ArgsValidator> & ServiceActorArgs
        const actor = await resolveActor(ctx, args as ArgsWithServiceAuth)
        const cleanArgs = stripServiceArgs(args as Record<string, unknown>) as ObjectType<ArgsValidator>
        checkPermission(actor, config.require)
        return await config.handler({ db: ctx.db, actor }, cleanArgs)
      }) as never,
    })
  }

  function scopedQuery<ArgsValidator extends PropertyValidators>(
    config: ScopedBuilderOptions<ArgsValidator, Permission, QueryCtx>,
  ) {
    return queryGeneric({
      args: { ...config.args, ...serviceAuthArgs },
      handler: (async (
        ctx: QueryCtx,
        ...rawArgs: [args?: ObjectType<ArgsValidator> & ServiceActorArgs]
      ) => {
        const args = (rawArgs[0] ?? {}) as ObjectType<ArgsValidator> & ServiceActorArgs
        const actor = await requireActor(ctx, args as ArgsWithServiceAuth)
        const cleanArgs = stripServiceArgs(args as Record<string, unknown>) as ObjectType<ArgsValidator>
        const orgId = resolveOrgId(actor, cleanArgs as Record<string, unknown>, tenant)
        if (!orgId) {
          throw new Error('Organization membership required.')
        }

        const resource = config.resource
          ? await loadResource(ctx, {
              schema: options.schema,
              scopedTables,
              tenant,
              orgId,
              resolver: config.resource as (args: Record<string, unknown>) => ResourceRef,
              args: cleanArgs as Record<string, unknown>,
            })
          : undefined

        checkPermission(actor, config.require, resource)

        return await config.handler({
          db: createScopedReader(ctx.db, orgId, tenant.orgField, scopedTables),
          actor: { ...actor, orgId },
          raw: { ctx, db: ctx.db },
          ...(resource ? { resource } : {}),
        }, cleanArgs)
      }) as never,
    })
  }

  function scopedMutation<ArgsValidator extends PropertyValidators>(
    config: ScopedBuilderOptions<ArgsValidator, Permission, MutationCtx>,
  ) {
    return mutationGeneric({
      args: { ...config.args, ...serviceAuthArgs },
      handler: (async (
        ctx: MutationCtx,
        ...rawArgs: [args?: ObjectType<ArgsValidator> & ServiceActorArgs]
      ) => {
        const args = (rawArgs[0] ?? {}) as ObjectType<ArgsValidator> & ServiceActorArgs
        const actor = await requireActor(ctx, args as ArgsWithServiceAuth)
        const cleanArgs = stripServiceArgs(args as Record<string, unknown>) as ObjectType<ArgsValidator>
        const orgId = resolveOrgId(actor, cleanArgs as Record<string, unknown>, tenant)
        if (!orgId) {
          throw new Error('Organization membership required.')
        }

        const resource = config.resource
          ? await loadResource(ctx, {
              schema: options.schema,
              scopedTables,
              tenant,
              orgId,
              resolver: config.resource as (args: Record<string, unknown>) => ResourceRef,
              args: cleanArgs as Record<string, unknown>,
            })
          : undefined

        checkPermission(actor, config.require, resource)

        return await config.handler({
          db: createScopedWriter(ctx.db, orgId, tenant.orgField, scopedTables),
          actor: { ...actor, orgId },
          raw: { ctx, db: ctx.db },
          ...(resource ? { resource } : {}),
        }, cleanArgs)
      }) as never,
    })
  }

  return {
    publicQuery,
    publicMutation,
    openQuery,
    openMutation,
    authedQuery,
    authedMutation,
    scopedQuery,
    scopedMutation,
  }
}
