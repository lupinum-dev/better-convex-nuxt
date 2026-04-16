import {
  customAction,
  customMutation,
  customQuery,
  type Customization,
} from 'convex-helpers/server/customFunctions'
import {
  type RLSConfig,
  type Rules,
  wrapDatabaseReader,
  wrapDatabaseWriter,
} from 'convex-helpers/server/rowLevelSecurity'
import type { Triggers } from 'convex-helpers/server/triggers'
import type {
  ActionBuilder,
  FunctionVisibility,
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
  MutationBuilder,
  QueryBuilder,
  RegisteredAction,
  RegisteredMutation,
  RegisteredQuery,
  TableNamesInDataModel,
} from 'convex/server'
import type { ObjectType, PropertyValidators } from 'convex/values'
import { v } from 'convex/values'

import { defineActor, type DefaultActor } from '../auth/define-actor.js'
import type { ServiceDefinitions } from '../auth/define-services.js'
import { createComponentBridge } from './create-component-bridge.js'
import { buildStructuredBuilder, buildStructuredFunctions } from './define-handler.js'
import type {
  StructuredGuard,
  StructuredHandlerDefinition,
  StructuredLoadedValue,
} from './define-handler.js'
import {
  definePrincipal,
  type DefaultPrincipal,
  type PrincipalDefinition,
} from './define-principal.js'

export type {
  StructuredGuard,
  StructuredHandlerDefinition,
  StructuredLoadedValue,
} from './define-handler.js'
export { createComponentBridge } from './create-component-bridge.js'
export {
  defineComponentBridgeManifest,
  renderComponentBridgeFile,
  renderComponentBridgeFiles,
  stripComponentBridgeMetadata,
} from './component-bridge-manifest.js'
export {
  defineOperation,
  getOperationMetadata,
  previewOf,
  trellisOperationMetadataKey,
  trellisOperationProjectionMetadataKey,
} from './define-operation.js'
export type {
  DestructiveOperationPreview,
  OperationDefinition,
  OperationKind,
  TrellisOperationMetadata,
  TrellisOperationProjectionMetadata,
} from './define-operation.js'
export { definePrincipal } from './define-principal.js'
export type { DefaultPrincipal, PrincipalDefinition } from './define-principal.js'
export type {
  ComponentBridgeGeneratedFile,
  ComponentBridgeManifest,
} from './component-bridge-manifest.js'

type DataCtx<DataModel extends GenericDataModel> =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>

type AnyCtx<DataModel extends GenericDataModel> =
  | DataCtx<DataModel>
  | GenericActionCtx<DataModel>

export type PrincipalAccessor<TPrincipal> = () => Promise<TPrincipal>
export type ActorAccessor<TActor> = () => Promise<TActor | null>

export type FunctionsCtxExtension<TPrincipal, TActor> = {
  principal: PrincipalAccessor<TPrincipal>
  actor: ActorAccessor<TActor>
}

type QueryDbWithRuntime<DataModel extends GenericDataModel> = GenericQueryCtx<DataModel>['db'] & {
  raw: GenericQueryCtx<DataModel>['db']
  crossTenant: GenericQueryCtx<DataModel>['db']
}

type MutationDbWithRuntime<DataModel extends GenericDataModel> =
  GenericMutationCtx<DataModel>['db'] & {
    raw: GenericMutationCtx<DataModel>['db']
    crossTenant: GenericMutationCtx<DataModel>['db']
  }

type AnyCtxWithRuntime<DataModel extends GenericDataModel, TPrincipal, TActor> = AnyCtx<DataModel> &
  FunctionsCtxExtension<TPrincipal, TActor>

type QueryCtxWithRuntime<
  DataModel extends GenericDataModel,
  TPrincipal,
  TActor,
> = Omit<GenericQueryCtx<DataModel>, 'db'> & {
  db: QueryDbWithRuntime<DataModel>
} & FunctionsCtxExtension<TPrincipal, TActor>

type MutationCtxWithRuntime<
  DataModel extends GenericDataModel,
  TPrincipal,
  TActor,
> = Omit<GenericMutationCtx<DataModel>, 'db'> & {
  db: MutationDbWithRuntime<DataModel>
} & FunctionsCtxExtension<TPrincipal, TActor>

type ActionCtxWithRuntime<
  DataModel extends GenericDataModel,
  TPrincipal,
  TActor,
> = GenericActionCtx<DataModel> & FunctionsCtxExtension<TPrincipal, TActor>

type RuleCtx<DataModel extends GenericDataModel, TPrincipal, TActor> = DataCtx<DataModel> &
  FunctionsCtxExtension<TPrincipal, TActor>

type OnSuccessArgs<Ctx> = {
  ctx: Ctx
  args: Record<string, unknown>
  result: unknown
}

type TenantIsolationOptions<DataModel extends GenericDataModel> = {
  tables: Array<TableNamesInDataModel<DataModel>>
  field?: string
}

type ServiceAccessDefinition<DataModel extends GenericDataModel, TPrincipal> = ServiceDefinitions<
  TableNamesInDataModel<DataModel>,
  TPrincipal
>

type MaybeRules<Ctx, DataModel extends GenericDataModel> =
  | Rules<Ctx, DataModel>
  | ((ctx: Ctx) => Promise<Rules<Ctx, DataModel>> | Rules<Ctx, DataModel>)

type QueryCustomizationCtx<
  DataModel extends GenericDataModel,
  TPrincipal,
  TActor,
> = GenericQueryCtx<DataModel> & FunctionsCtxExtension<TPrincipal, TActor>

type MutationCustomizationCtx<
  DataModel extends GenericDataModel,
  TPrincipal,
  TActor,
> = GenericMutationCtx<DataModel> & FunctionsCtxExtension<TPrincipal, TActor>

type ActionCustomizationCtx<
  DataModel extends GenericDataModel,
  TPrincipal,
  TActor,
> = GenericActionCtx<DataModel> & FunctionsCtxExtension<TPrincipal, TActor>

type AppBuilders<
  DataModel extends GenericDataModel,
  QueryVisibility extends FunctionVisibility,
  MutationVisibility extends FunctionVisibility,
  InternalQueryVisibility extends FunctionVisibility = 'internal',
  InternalMutationVisibility extends FunctionVisibility = 'internal',
  ActionVisibility extends FunctionVisibility = 'public',
> = {
  query: QueryBuilder<DataModel, QueryVisibility>
  mutation: MutationBuilder<DataModel, MutationVisibility>
  action?: ActionBuilder<DataModel, ActionVisibility>
  internalQuery?: QueryBuilder<DataModel, InternalQueryVisibility>
  internalMutation?: MutationBuilder<DataModel, InternalMutationVisibility>
}

export interface DefineTrellisOptions<
  DataModel extends GenericDataModel,
  TPrincipal = DefaultPrincipal,
  TActor = DefaultActor,
> {
  principal?: PrincipalDefinition<AnyCtx<DataModel>, TPrincipal>
  actor?: (
    ctx: AnyCtx<DataModel> & Pick<FunctionsCtxExtension<TPrincipal, TActor>, 'principal'>,
    args: Record<string, unknown>,
    principal: TPrincipal,
  ) => Promise<TActor | null>
  tenantIsolation?: TenantIsolationOptions<DataModel>
  services?: ServiceAccessDefinition<DataModel, TPrincipal>
  rls?: {
    rules: MaybeRules<RuleCtx<DataModel, TPrincipal, TActor>, DataModel>
    config?: RLSConfig
  }
  triggers?: Triggers<
    DataModel,
    GenericMutationCtx<DataModel> & FunctionsCtxExtension<TPrincipal, TActor>
  >
  onSuccess?: {
    query?: (
      args: OnSuccessArgs<AnyCtxWithRuntime<DataModel, TPrincipal, TActor>>,
    ) => Promise<void> | void
    mutation?: (
      args: OnSuccessArgs<AnyCtxWithRuntime<DataModel, TPrincipal, TActor>>,
    ) => Promise<void> | void
    action?: (
      args: OnSuccessArgs<AnyCtxWithRuntime<DataModel, TPrincipal, TActor>>,
    ) => Promise<void> | void
  }
}

function validateTenantIsolationOptions<DataModel extends GenericDataModel>(
  options: TenantIsolationOptions<DataModel> | undefined,
): void {
  if (!options) return

  if (options.tables.length === 0) {
    throw new Error('tenantIsolation.tables must include at least one table.')
  }

  const seen = new Set<string>()
  for (const table of options.tables) {
    if (typeof table !== 'string' || table.trim().length === 0) {
      throw new Error('tenantIsolation.tables must only contain non-empty table names.')
    }
    if (seen.has(table)) {
      throw new Error(`tenantIsolation.tables contains a duplicate table: "${table}".`)
    }
    seen.add(table)
  }

  if (options.field !== undefined && options.field.trim().length === 0) {
    throw new Error('tenantIsolation.field must be a non-empty string when provided.')
  }
}

function hasTenantId(value: unknown): value is { tenantId?: unknown } {
  return typeof value === 'object' && value !== null && 'tenantId' in value
}

function getTenantId(actor: unknown): unknown {
  if (!hasTenantId(actor)) return undefined
  return actor.tenantId
}

function hasTenantScope(value: unknown): boolean {
  return value !== undefined && value !== null
}

function isServicePrincipal(value: unknown): value is { kind: 'service'; serviceId: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    (value as { kind?: unknown }).kind === 'service' &&
    typeof (value as { serviceId?: unknown }).serviceId === 'string'
  )
}

type ResolvedServiceAccess<DataModel extends GenericDataModel> =
  | null
  | {
      serviceId: string
      access: 'unrestricted'
    }
  | {
      serviceId: string
      access: 'restricted'
      tables: ReadonlySet<TableNamesInDataModel<DataModel>>
      tenant: 'global' | 'derived'
      tenantId: unknown
    }

function getServiceError(serviceId: string, table: string): Error {
  return new Error(`Service "${serviceId}" has no access to table "${table}".`)
}

function getServiceTableFromId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const separator = value.lastIndexOf(';')
  if (separator === -1) return null
  return value.slice(separator + 1)
}

function assertServiceTableAccess<DataModel extends GenericDataModel>(
  access: ResolvedServiceAccess<DataModel>,
  table: string,
): void {
  if (!access || access.access === 'unrestricted') return
  if (!access.tables.has(table as TableNamesInDataModel<DataModel>)) {
    throw getServiceError(access.serviceId, table)
  }
}

function wrapServiceDb<TDb extends object, DataModel extends GenericDataModel>(
  db: TDb,
  access: ResolvedServiceAccess<DataModel>,
): TDb {
  if (!access || access.access === 'unrestricted') return db

  return new Proxy(db, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver)
      if (typeof original !== 'function') return original

      if (prop === 'query') {
        return (table: TableNamesInDataModel<DataModel>) => {
          assertServiceTableAccess(access, String(table))
          return original.call(target, table)
        }
      }

      if (prop === 'insert') {
        return (table: TableNamesInDataModel<DataModel>, value: unknown) => {
          assertServiceTableAccess(access, String(table))
          return original.call(target, table, value)
        }
      }

      if (prop === 'get' || prop === 'patch' || prop === 'replace' || prop === 'delete') {
        return (id: unknown, ...args: unknown[]) => {
          const table = getServiceTableFromId(id)
          if (!table) {
            throw new Error(`Could not determine table from Convex id "${String(id)}".`)
          }
          assertServiceTableAccess(access, table)
          return original.call(target, id, ...args)
        }
      }

      return original.bind(target)
    },
  }) as TDb
}

function createServiceScopeRule<TDoc extends Record<string, unknown>>(
  field: string,
  tenantId: unknown,
) {
  return async (_ctx: unknown, doc: TDoc) => {
    const documentTenantId = doc[field as keyof TDoc]

    if (
      hasTenantScope(tenantId) &&
      hasTenantScope(documentTenantId) &&
      documentTenantId === tenantId
    ) {
      return true
    }

    if (process.env.NODE_ENV === 'production') {
      return false
    }

    throw new Error(
      `Service scope denied access.\nExpected: ${String(tenantId)}\nReason: ${field} ${String(documentTenantId)}`,
    )
  }
}

function createTenantIsolationRule<
  DataModel extends GenericDataModel,
  TPrincipal,
  TActor,
  TDoc extends Record<string, unknown>,
>(field: string) {
  return async (ctx: AnyCtxWithRuntime<DataModel, TPrincipal, TActor>, doc: TDoc) => {
    const actorTenantId = getTenantId(await ctx.actor())
    const documentTenantId = doc[field as keyof TDoc]

    if (
      hasTenantScope(actorTenantId) &&
      hasTenantScope(documentTenantId) &&
      documentTenantId === actorTenantId
    ) {
      return true
    }

    if (process.env.NODE_ENV === 'production') {
      return false
    }

    throw new Error(
      `Document belongs to a different tenant.\nActor: ${String(actorTenantId)}\nReason: ${field} ${String(documentTenantId)}`,
    )
  }
}

function buildTenantIsolationRules<DataModel extends GenericDataModel, TPrincipal, TActor>(
  options: TenantIsolationOptions<DataModel> | undefined,
): Rules<RuleCtx<DataModel, TPrincipal, TActor>, DataModel> {
  const rules = {} as Rules<RuleCtx<DataModel, TPrincipal, TActor>, DataModel>
  if (!options) return rules

  const field = options.field ?? 'workspaceId'

  for (const table of options.tables) {
    const tenantRule = createTenantIsolationRule<
      DataModel,
      TPrincipal,
      TActor,
      Record<string, unknown>
    >(field)
    rules[table] = {
      read: tenantRule,
      modify: tenantRule,
      insert: tenantRule,
    }
  }

  return rules
}

async function resolveServiceAccess<DataModel extends GenericDataModel, TPrincipal, TActor>(
  ctx: RuleCtx<DataModel, TPrincipal, TActor>,
  args: Record<string, unknown>,
  options: DefineTrellisOptions<DataModel, TPrincipal, TActor>,
): Promise<ResolvedServiceAccess<DataModel>> {
  const principal = await ctx.principal()
  if (!isServicePrincipal(principal)) return null

  const service = options.services?.[principal.serviceId]
  if (!service) {
    throw new Error(`Service "${principal.serviceId}" is not configured in defineTrellis({ services }).`)
  }

  if (service.access === 'unrestricted') {
    return {
      serviceId: principal.serviceId,
      access: 'unrestricted',
    }
  }

  const tenantId =
    service.access.tenant === 'derived'
      ? await service.access.deriveTenant({ principal, args })
      : null

  return {
    serviceId: principal.serviceId,
    access: 'restricted',
    tables: new Set(service.access.tables),
    tenant: service.access.tenant,
    tenantId,
  }
}

function buildServiceRules<DataModel extends GenericDataModel, TPrincipal, TActor>(
  access: ResolvedServiceAccess<DataModel>,
  options: TenantIsolationOptions<DataModel> | undefined,
): Rules<RuleCtx<DataModel, TPrincipal, TActor>, DataModel> {
  const rules = {} as Rules<RuleCtx<DataModel, TPrincipal, TActor>, DataModel>
  if (!access || access.access === 'unrestricted') return rules
  if (access.tenant !== 'derived') return rules

  const field = options?.field ?? 'workspaceId'

  for (const table of access.tables) {
    const scopeRule = createServiceScopeRule<Record<string, unknown>>(field, access.tenantId)
    rules[table] = {
      read: scopeRule,
      modify: scopeRule,
      insert: scopeRule,
    }
  }

  return rules
}

function combineRuleCheck<Ctx, Doc>(
  left:
    | ((ctx: Ctx, doc: Doc) => Promise<boolean> | boolean)
    | undefined,
  right:
    | ((ctx: Ctx, doc: Doc) => Promise<boolean> | boolean)
    | undefined,
) {
  if (!left) return right
  if (!right) return left

  return async (ctx: Ctx, doc: Doc) => {
    const leftAllowed = await left(ctx, doc)
    if (!leftAllowed) return false
    return await right(ctx, doc)
  }
}

function mergeRules<Ctx, DataModel extends GenericDataModel>(
  base: Rules<Ctx, DataModel>,
  extra: Rules<Ctx, DataModel>,
): Rules<Ctx, DataModel> {
  const merged = { ...base }

  for (const [table, rule] of Object.entries(extra) as Array<
    [TableNamesInDataModel<DataModel>, Rules<Ctx, DataModel>[TableNamesInDataModel<DataModel>]]
  >) {
    merged[table] = {
      ...merged[table],
      ...rule,
      read: combineRuleCheck(merged[table]?.read, rule?.read),
      modify: combineRuleCheck(merged[table]?.modify, rule?.modify),
      insert: combineRuleCheck(merged[table]?.insert, rule?.insert),
    } as Rules<Ctx, DataModel>[TableNamesInDataModel<DataModel>]
  }

  return merged
}

type ResolvedRules<DataModel extends GenericDataModel, TPrincipal, TActor> = {
  dbRules: Rules<RuleCtx<DataModel, TPrincipal, TActor>, DataModel> | null
  crossTenantRules: Rules<RuleCtx<DataModel, TPrincipal, TActor>, DataModel> | null
  serviceAccess: ResolvedServiceAccess<DataModel>
}

async function resolveRules<DataModel extends GenericDataModel, TPrincipal, TActor>(
  ctx: RuleCtx<DataModel, TPrincipal, TActor>,
  args: Record<string, unknown>,
  options: DefineTrellisOptions<DataModel, TPrincipal, TActor>,
): Promise<ResolvedRules<DataModel, TPrincipal, TActor>> {
  const tenantRules = buildTenantIsolationRules<DataModel, TPrincipal, TActor>(
    options.tenantIsolation,
  )
  const rlsRules = options.rls?.rules
  const serviceAccess = await resolveServiceAccess(ctx, args, options)
  const serviceRules = buildServiceRules(serviceAccess, options.tenantIsolation)

  const resolvedCustomRules =
    typeof rlsRules === 'function' ? await rlsRules(ctx) : (rlsRules ?? {})

  const isService = serviceAccess !== null
  const dbRules = isService
    ? mergeRules(serviceRules, resolvedCustomRules)
    : mergeRules(tenantRules, resolvedCustomRules)
  const crossTenantRules = mergeRules(serviceRules, resolvedCustomRules)

  return {
    dbRules: Object.keys(dbRules).length > 0 ? dbRules : null,
    crossTenantRules: Object.keys(crossTenantRules).length > 0 ? crossTenantRules : null,
    serviceAccess,
  }
}

type StructuredQueryBuilder<
  TCtx extends { principal: () => Promise<unknown> },
  Visibility extends FunctionVisibility,
  TActor,
> = <
  TGuard extends StructuredGuard<Awaited<ReturnType<TCtx['principal']>>, TActor>,
  TArgsValidator extends PropertyValidators,
  TLoaded extends StructuredLoadedValue = undefined,
  TResult = unknown,
>(
  definition: StructuredHandlerDefinition<
    TCtx,
    Awaited<ReturnType<TCtx['principal']>>,
    TActor,
    TGuard,
    TArgsValidator,
    TLoaded,
    TResult
  >,
) => RegisteredQuery<Visibility, ObjectType<TArgsValidator>, TResult>

type StructuredMutationBuilder<
  TCtx extends { principal: () => Promise<unknown> },
  Visibility extends FunctionVisibility,
  TActor,
> = <
  TGuard extends StructuredGuard<Awaited<ReturnType<TCtx['principal']>>, TActor>,
  TArgsValidator extends PropertyValidators,
  TLoaded extends StructuredLoadedValue = undefined,
  TResult = unknown,
>(
  definition: StructuredHandlerDefinition<
    TCtx,
    Awaited<ReturnType<TCtx['principal']>>,
    TActor,
    TGuard,
    TArgsValidator,
    TLoaded,
    TResult
  >,
) => RegisteredMutation<Visibility, ObjectType<TArgsValidator>, TResult>

type StructuredActionBuilder<
  TCtx extends { principal: () => Promise<unknown> },
  Visibility extends FunctionVisibility,
  TActor,
> = <
  TGuard extends StructuredGuard<Awaited<ReturnType<TCtx['principal']>>, TActor>,
  TArgsValidator extends PropertyValidators,
  TLoaded extends StructuredLoadedValue = undefined,
  TResult = unknown,
>(
  definition: StructuredHandlerDefinition<
    TCtx,
    Awaited<ReturnType<TCtx['principal']>>,
    TActor,
    TGuard,
    TArgsValidator,
    TLoaded,
    TResult
  >,
) => RegisteredAction<Visibility, ObjectType<TArgsValidator>, TResult>

type RuntimeBundle<
  DataModel extends GenericDataModel,
  TCtx extends AnyCtx<DataModel>,
  TPrincipal,
  TActor,
> = {
  principal: PrincipalAccessor<TPrincipal>
  actor: ActorAccessor<TActor>
  baseCtx: TCtx & FunctionsCtxExtension<TPrincipal, TActor>
}

function resolvePrincipal<DataModel extends GenericDataModel, TPrincipal>(
  principalDefinition: PrincipalDefinition<AnyCtx<DataModel>, TPrincipal> | undefined,
): PrincipalDefinition<AnyCtx<DataModel>, TPrincipal> {
  return (principalDefinition ?? definePrincipal.fromAuth<DataModel>()) as PrincipalDefinition<
    AnyCtx<DataModel>,
    TPrincipal
  >
}

function resolveActor<DataModel extends GenericDataModel, TPrincipal, TActor>(
  actorResolver:
    | ((
        ctx: AnyCtx<DataModel> & Pick<FunctionsCtxExtension<TPrincipal, TActor>, 'principal'>,
        args: Record<string, unknown>,
        principal: TPrincipal,
      ) => Promise<TActor | null>)
    | undefined,
): (
  ctx: AnyCtx<DataModel> & Pick<FunctionsCtxExtension<TPrincipal, TActor>, 'principal'>,
  args: Record<string, unknown>,
  principal: TPrincipal,
) => Promise<TActor | null> {
  return (actorResolver ??
    (async (ctx) => await defineActor.fromAuth<DataModel>().resolve(ctx))) as (
    ctx: AnyCtx<DataModel> & Pick<FunctionsCtxExtension<TPrincipal, TActor>, 'principal'>,
    args: Record<string, unknown>,
    principal: TPrincipal,
  ) => Promise<TActor | null>
}

function createContextWithRuntime<
  DataModel extends GenericDataModel,
  TCtx extends AnyCtx<DataModel>,
  TPrincipal,
  TActor,
>(
  ctx: TCtx,
  args: Record<string, unknown>,
  principalResolver: PrincipalDefinition<AnyCtx<DataModel>, TPrincipal>,
  actorResolver: (
    ctx: TCtx & Pick<FunctionsCtxExtension<TPrincipal, TActor>, 'principal'>,
    args: Record<string, unknown>,
    principal: TPrincipal,
  ) => Promise<TActor | null>,
): RuntimeBundle<DataModel, TCtx, TPrincipal, TActor> {
  let principalPromise: Promise<TPrincipal> | null = null
  const principal: PrincipalAccessor<TPrincipal> = async () => {
    principalPromise ??= Promise.resolve(principalResolver.resolve(ctx, args))
    return await principalPromise
  }

  const ctxWithPrincipal = {
    ...ctx,
    principal,
  } as TCtx & Pick<FunctionsCtxExtension<TPrincipal, TActor>, 'principal'>

  let actorPromise: Promise<TActor | null> | null = null
  const actor: ActorAccessor<TActor> = async () => {
    actorPromise ??= actorResolver(ctxWithPrincipal, args, await principal())
    return await actorPromise
  }

  return {
    principal,
    actor,
    baseCtx: {
      ...ctxWithPrincipal,
      actor,
    } as TCtx & FunctionsCtxExtension<TPrincipal, TActor>,
  }
}

function createOnSuccessHandler<Ctx>(
  handler: ((args: OnSuccessArgs<Ctx>) => Promise<void> | void) | undefined,
  ctx: Ctx,
): ((payload: { args: Record<string, unknown>; result: unknown }) => Promise<void>) | undefined {
  if (!handler) return undefined

  return async ({ args, result }) => {
    await handler({
      ctx,
      args,
      result,
    })
  }
}

function decorateDb<TDb extends object>(
  db: TDb,
  rawDb: TDb,
  crossTenantDb: TDb,
): TDb & { raw: TDb; crossTenant: TDb } {
  return Object.assign(db, {
    raw: rawDb,
    crossTenant: crossTenantDb,
  }) as TDb & { raw: TDb; crossTenant: TDb }
}

function createQueryCustomization<DataModel extends GenericDataModel, TPrincipal, TActor>(
  options: DefineTrellisOptions<DataModel, TPrincipal, TActor>,
): Customization<
  GenericQueryCtx<DataModel>,
  PropertyValidators,
  QueryCustomizationCtx<DataModel, TPrincipal, TActor>,
  Record<string, never>
> {
  const principalDefinition = resolvePrincipal(options.principal)
  const actorResolver = resolveActor(options.actor)
  const principalArgs: PropertyValidators = principalDefinition.validator
    ? { principal: v.optional(principalDefinition.validator) }
    : {}

  return {
    args: principalArgs,
    input: async (ctx, args) => {
      const { baseCtx } = createContextWithRuntime(ctx, args, principalDefinition, actorResolver)
      const { dbRules, crossTenantRules, serviceAccess } = await resolveRules(baseCtx, args, options)
      const rawDb = ctx.db
      const serviceDb = wrapServiceDb(rawDb, serviceAccess)
      const db = dbRules
        ? wrapDatabaseReader(baseCtx, serviceDb, dbRules, options.rls?.config)
        : serviceDb
      const crossTenantDb = crossTenantRules
        ? wrapDatabaseReader(baseCtx, serviceDb, crossTenantRules, options.rls?.config)
        : serviceDb
      const finalCtx: QueryCtxWithRuntime<DataModel, TPrincipal, TActor> = {
        ...(baseCtx as unknown as QueryCtxWithRuntime<DataModel, TPrincipal, TActor>),
        db: decorateDb(db, rawDb, crossTenantDb),
      }

      return {
        ctx: finalCtx,
        args: {},
        onSuccess: createOnSuccessHandler(options.onSuccess?.query, finalCtx),
      }
    },
  }
}

function createMutationCustomization<DataModel extends GenericDataModel, TPrincipal, TActor>(
  options: DefineTrellisOptions<DataModel, TPrincipal, TActor>,
): Customization<
  GenericMutationCtx<DataModel>,
  PropertyValidators,
  MutationCustomizationCtx<DataModel, TPrincipal, TActor>,
  Record<string, never>
> {
  const principalDefinition = resolvePrincipal(options.principal)
  const actorResolver = resolveActor(options.actor)
  const principalArgs: PropertyValidators = principalDefinition.validator
    ? { principal: v.optional(principalDefinition.validator) }
    : {}

  return {
    args: principalArgs,
    input: async (ctx, args) => {
      const { baseCtx } = createContextWithRuntime(ctx, args, principalDefinition, actorResolver)
      const { dbRules, crossTenantRules, serviceAccess } = await resolveRules(baseCtx, args, options)
      const rawDb = ctx.db
      const serviceDb = wrapServiceDb(rawDb, serviceAccess)
      let db = dbRules
        ? wrapDatabaseWriter(baseCtx, serviceDb, dbRules, options.rls?.config)
        : serviceDb
      let crossTenantDb = crossTenantRules
        ? wrapDatabaseWriter(baseCtx, serviceDb, crossTenantRules, options.rls?.config)
        : serviceDb

      if (options.triggers) {
        db = options.triggers.wrapDB({
          ...(baseCtx as unknown as MutationCtxWithRuntime<DataModel, TPrincipal, TActor>),
          db,
        }).db
        crossTenantDb = options.triggers.wrapDB({
          ...(baseCtx as unknown as MutationCtxWithRuntime<DataModel, TPrincipal, TActor>),
          db: crossTenantDb,
        }).db
      }

      const finalCtx: MutationCtxWithRuntime<DataModel, TPrincipal, TActor> = {
        ...(baseCtx as unknown as MutationCtxWithRuntime<DataModel, TPrincipal, TActor>),
        db: decorateDb(db, rawDb, crossTenantDb),
      }

      return {
        ctx: finalCtx,
        args: {},
        onSuccess: createOnSuccessHandler(options.onSuccess?.mutation, finalCtx),
      }
    },
  }
}

function createActionCustomization<DataModel extends GenericDataModel, TPrincipal, TActor>(
  options: DefineTrellisOptions<DataModel, TPrincipal, TActor>,
): Customization<
  GenericActionCtx<DataModel>,
  PropertyValidators,
  ActionCustomizationCtx<DataModel, TPrincipal, TActor>,
  Record<string, never>
> {
  const principalDefinition = resolvePrincipal(options.principal)
  const actorResolver = resolveActor(options.actor)
  const principalArgs: PropertyValidators = principalDefinition.validator
    ? { principal: v.optional(principalDefinition.validator) }
    : {}

  return {
    args: principalArgs,
    input: async (ctx, args) => {
      const { baseCtx } = createContextWithRuntime(ctx, args, principalDefinition, actorResolver)
      const finalCtx = baseCtx as unknown as ActionCtxWithRuntime<DataModel, TPrincipal, TActor>

      return {
        ctx: finalCtx,
        args: {},
        onSuccess: createOnSuccessHandler(options.onSuccess?.action, finalCtx),
      }
    },
  }
}

function buildRawFunctions<
  DataModel extends GenericDataModel,
  QueryVisibility extends FunctionVisibility,
  MutationVisibility extends FunctionVisibility,
  InternalQueryVisibility extends FunctionVisibility,
  InternalMutationVisibility extends FunctionVisibility,
  ActionVisibility extends FunctionVisibility,
  TPrincipal,
  TActor = DefaultActor,
>(
  builders: AppBuilders<
    DataModel,
    QueryVisibility,
    MutationVisibility,
    InternalQueryVisibility,
    InternalMutationVisibility,
    ActionVisibility
  >,
  options: DefineTrellisOptions<DataModel, TPrincipal, TActor> = {},
) {
  validateTenantIsolationOptions(options.tenantIsolation)

  if (!!builders.internalQuery !== !!builders.internalMutation) {
    throw new Error(
      'defineTrellis(...) requires both internalQuery and internalMutation when either internal builder is provided.',
    )
  }

  const queryCustomization = createQueryCustomization(options)
  const mutationCustomization = createMutationCustomization(options)
  const actionCustomization = createActionCustomization(options)

  return {
    query: customQuery(builders.query, queryCustomization),
    mutation: customMutation(builders.mutation, mutationCustomization),
    action: builders.action ? customAction(builders.action, actionCustomization) : undefined,
    internal: {
      query: builders.internalQuery
        ? customQuery(builders.internalQuery, queryCustomization)
        : undefined,
      mutation: builders.internalMutation
        ? customMutation(builders.internalMutation, mutationCustomization)
        : undefined,
    },
  }
}

function buildTrellisRuntime<
  DataModel extends GenericDataModel,
  QueryVisibility extends FunctionVisibility,
  MutationVisibility extends FunctionVisibility,
  InternalQueryVisibility extends FunctionVisibility = 'internal',
  InternalMutationVisibility extends FunctionVisibility = 'internal',
  TPrincipal = DefaultPrincipal,
  TActor = DefaultActor,
  ActionVisibility extends FunctionVisibility = 'public',
>(
  builders: AppBuilders<
    DataModel,
    QueryVisibility,
    MutationVisibility,
    InternalQueryVisibility,
    InternalMutationVisibility,
    ActionVisibility
  >,
  options: DefineTrellisOptions<DataModel, TPrincipal, TActor> = {},
) {
  const raw = buildRawFunctions(builders, options)
  const structured = buildStructuredFunctions<
    QueryCtxWithRuntime<DataModel, TPrincipal, TActor>,
    MutationCtxWithRuntime<DataModel, TPrincipal, TActor>,
    TPrincipal,
    TActor
  >(raw.query, raw.mutation) as {
    query: StructuredQueryBuilder<
      QueryCtxWithRuntime<DataModel, TPrincipal, TActor>,
      QueryVisibility,
      TActor
    >
    mutation: StructuredMutationBuilder<
      MutationCtxWithRuntime<DataModel, TPrincipal, TActor>,
      MutationVisibility,
      TActor
    >
  }

  const structuredInternal =
    raw.internal.query && raw.internal.mutation
      ? (buildStructuredFunctions<
          QueryCtxWithRuntime<DataModel, TPrincipal, TActor>,
          MutationCtxWithRuntime<DataModel, TPrincipal, TActor>,
          TPrincipal,
          TActor
        >(raw.internal.query, raw.internal.mutation) as {
          query: StructuredQueryBuilder<
            QueryCtxWithRuntime<DataModel, TPrincipal, TActor>,
            InternalQueryVisibility,
            TActor
          >
          mutation: StructuredMutationBuilder<
            MutationCtxWithRuntime<DataModel, TPrincipal, TActor>,
            InternalMutationVisibility,
            TActor
          >
        })
      : undefined

  const action = raw.action
    ? (buildStructuredBuilder<
        ActionCtxWithRuntime<DataModel, TPrincipal, TActor>,
        TPrincipal,
        TActor,
        typeof raw.action
      >(raw.action) as StructuredActionBuilder<
        ActionCtxWithRuntime<DataModel, TPrincipal, TActor>,
        ActionVisibility,
        TActor
      >)
    : undefined

  return {
    query: structured.query,
    mutation: structured.mutation,
    ...(action ? { action } : {}),
    ...(structuredInternal
      ? {
          internalQuery: structuredInternal.query,
          internalMutation: structuredInternal.mutation,
        }
      : {}),
    raw: {
      query: raw.query,
      mutation: raw.mutation,
      ...(raw.action ? { action: raw.action } : {}),
      ...(raw.internal.query ? { internalQuery: raw.internal.query } : {}),
      ...(raw.internal.mutation ? { internalMutation: raw.internal.mutation } : {}),
    },
    createComponentBridge: () =>
      createComponentBridge(
        {
          query: builders.query,
          mutation: builders.mutation,
          internalQuery: builders.internalQuery!,
          internalMutation: builders.internalMutation!,
        },
        {
          principal: resolvePrincipal(options.principal),
        },
      ),
  }
}

/**
 * Build the protected Trellis backend runtime for a principal-first app.
 *
 * This is the canonical backend seam for Trellis apps. It exposes the protected
 * builders directly and keeps raw Convex builders as an explicit escape hatch.
 */
export function defineTrellis<
  DataModel extends GenericDataModel,
  QueryVisibility extends FunctionVisibility,
  MutationVisibility extends FunctionVisibility,
  InternalQueryVisibility extends FunctionVisibility = 'internal',
  InternalMutationVisibility extends FunctionVisibility = 'internal',
  TPrincipal = DefaultPrincipal,
  TActor = DefaultActor,
  ActionVisibility extends FunctionVisibility = 'public',
>(
  builders: AppBuilders<
    DataModel,
    QueryVisibility,
    MutationVisibility,
    InternalQueryVisibility,
    InternalMutationVisibility,
    ActionVisibility
  >,
  options: DefineTrellisOptions<DataModel, TPrincipal, TActor> = {},
) {
  const runtime = buildTrellisRuntime(builders, options)

  return {
    query: runtime.query,
    mutation: runtime.mutation,
    ...(runtime.action ? { action: runtime.action } : {}),
    ...(runtime.internalQuery
      ? {
          internalQuery: runtime.internalQuery,
          internalMutation: runtime.internalMutation,
        }
      : {}),
    raw: runtime.raw,
    createComponentBridge: runtime.createComponentBridge,
  }
}
