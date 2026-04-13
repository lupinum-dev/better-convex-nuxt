import {
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
  FunctionVisibility,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
  MutationBuilder,
  QueryBuilder,
  RegisteredMutation,
  RegisteredQuery,
  TableNamesInDataModel,
} from 'convex/server'
import type { ObjectType, PropertyValidators } from 'convex/values'
import { v } from 'convex/values'

import { defineActor, type DefaultActor } from '../auth/define-actor.js'
import { createComponentBridge } from './create-component-bridge.js'
import { buildStructuredFunctions } from './define-handler.js'
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
export { defineOperation, previewOf } from './define-operation.js'
export type { OperationDefinition } from './define-operation.js'
export { definePrincipal } from './define-principal.js'
export type { DefaultPrincipal, PrincipalDefinition } from './define-principal.js'

type AnyCtx<DataModel extends GenericDataModel> =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>

export type PrincipalAccessor<TPrincipal> = () => Promise<TPrincipal>
export type ActorAccessor<TActor> = () => Promise<TActor | null>

export type FunctionsCtxExtension<TPrincipal, TActor> = {
  principal: PrincipalAccessor<TPrincipal>
  actor: ActorAccessor<TActor>
}

type AnyCtxWithRuntime<DataModel extends GenericDataModel, TPrincipal, TActor> = AnyCtx<DataModel> &
  FunctionsCtxExtension<TPrincipal, TActor>

type QueryCtxWithRuntime<
  DataModel extends GenericDataModel,
  TPrincipal,
  TActor,
> = GenericQueryCtx<DataModel> & FunctionsCtxExtension<TPrincipal, TActor>

type MutationCtxWithRuntime<
  DataModel extends GenericDataModel,
  TPrincipal,
  TActor,
> = GenericMutationCtx<DataModel> & FunctionsCtxExtension<TPrincipal, TActor>

type OnSuccessArgs<Ctx> = {
  ctx: Ctx
  args: Record<string, unknown>
  result: unknown
}

type TenantIsolationOptions<DataModel extends GenericDataModel> = {
  tables: Array<TableNamesInDataModel<DataModel>>
  field?: string
}

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

type AppBuilders<
  DataModel extends GenericDataModel,
  QueryVisibility extends FunctionVisibility,
  MutationVisibility extends FunctionVisibility,
  InternalQueryVisibility extends FunctionVisibility = 'internal',
  InternalMutationVisibility extends FunctionVisibility = 'internal',
> = {
  query: QueryBuilder<DataModel, QueryVisibility>
  mutation: MutationBuilder<DataModel, MutationVisibility>
  internalQuery?: QueryBuilder<DataModel, InternalQueryVisibility>
  internalMutation?: MutationBuilder<DataModel, InternalMutationVisibility>
}

export interface CreateAppOptions<
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
  rls?: {
    rules: MaybeRules<AnyCtxWithRuntime<DataModel, TPrincipal, TActor>, DataModel>
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
): Rules<AnyCtxWithRuntime<DataModel, TPrincipal, TActor>, DataModel> {
  const rules = {} as Rules<AnyCtxWithRuntime<DataModel, TPrincipal, TActor>, DataModel>
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
    } as Rules<Ctx, DataModel>[TableNamesInDataModel<DataModel>]
  }

  return merged
}

async function resolveRules<DataModel extends GenericDataModel, TPrincipal, TActor>(
  ctx: AnyCtxWithRuntime<DataModel, TPrincipal, TActor>,
  options: CreateAppOptions<DataModel, TPrincipal, TActor>,
): Promise<Rules<AnyCtxWithRuntime<DataModel, TPrincipal, TActor>, DataModel> | null> {
  const tenantRules = buildTenantIsolationRules<DataModel, TPrincipal, TActor>(
    options.tenantIsolation,
  )
  const hasTenantRules = Object.keys(tenantRules).length > 0
  const rlsRules = options.rls?.rules

  if (!hasTenantRules && !rlsRules) return null

  const resolvedCustomRules =
    typeof rlsRules === 'function' ? await rlsRules(ctx) : (rlsRules ?? {})

  return mergeRules(tenantRules, resolvedCustomRules)
}

type StructuredQueryBuilder<TCtx extends object, Visibility extends FunctionVisibility, TActor> = <
  TGuard extends StructuredGuard<TActor>,
  TArgsValidator extends PropertyValidators,
  TLoaded extends StructuredLoadedValue = undefined,
  TResult = unknown,
>(
  definition: StructuredHandlerDefinition<TCtx, TActor, TGuard, TArgsValidator, TLoaded, TResult>,
) => RegisteredQuery<Visibility, ObjectType<TArgsValidator>, TResult>

type StructuredMutationBuilder<
  TCtx extends object,
  Visibility extends FunctionVisibility,
  TActor,
> = <
  TGuard extends StructuredGuard<TActor>,
  TArgsValidator extends PropertyValidators,
  TLoaded extends StructuredLoadedValue = undefined,
  TResult = unknown,
>(
  definition: StructuredHandlerDefinition<TCtx, TActor, TGuard, TArgsValidator, TLoaded, TResult>,
) => RegisteredMutation<Visibility, ObjectType<TArgsValidator>, TResult>

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

function createQueryCustomization<DataModel extends GenericDataModel, TPrincipal, TActor>(
  options: CreateAppOptions<DataModel, TPrincipal, TActor>,
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
      const resolvedRules = await resolveRules(baseCtx, options)
      const db = resolvedRules
        ? wrapDatabaseReader(baseCtx, ctx.db, resolvedRules, options.rls?.config)
        : ctx.db
      const finalCtx: QueryCtxWithRuntime<DataModel, TPrincipal, TActor> = {
        ...(baseCtx as unknown as QueryCtxWithRuntime<DataModel, TPrincipal, TActor>),
        db,
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
  options: CreateAppOptions<DataModel, TPrincipal, TActor>,
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
      const resolvedRules = await resolveRules(baseCtx, options)
      let db = resolvedRules
        ? wrapDatabaseWriter(baseCtx, ctx.db, resolvedRules, options.rls?.config)
        : ctx.db

      if (options.triggers) {
        db = options.triggers.wrapDB({
          ...(baseCtx as unknown as MutationCtxWithRuntime<DataModel, TPrincipal, TActor>),
          db,
        }).db
      }

      const finalCtx: MutationCtxWithRuntime<DataModel, TPrincipal, TActor> = {
        ...(baseCtx as unknown as MutationCtxWithRuntime<DataModel, TPrincipal, TActor>),
        db,
      }

      return {
        ctx: finalCtx,
        args: {},
        onSuccess: createOnSuccessHandler(options.onSuccess?.mutation, finalCtx),
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
  TPrincipal,
  TActor = DefaultActor,
>(
  builders: AppBuilders<
    DataModel,
    QueryVisibility,
    MutationVisibility,
    InternalQueryVisibility,
    InternalMutationVisibility
  >,
  options: CreateAppOptions<DataModel, TPrincipal, TActor> = {},
) {
  validateTenantIsolationOptions(options.tenantIsolation)

  if (!!builders.internalQuery !== !!builders.internalMutation) {
    throw new Error(
      'createApp(...) requires both internalQuery and internalMutation when either internal builder is provided.',
    )
  }

  const queryCustomization = createQueryCustomization(options)
  const mutationCustomization = createMutationCustomization(options)

  return {
    query: customQuery(builders.query, queryCustomization),
    mutation: customMutation(builders.mutation, mutationCustomization),
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

export function createApp<
  DataModel extends GenericDataModel,
  QueryVisibility extends FunctionVisibility,
  MutationVisibility extends FunctionVisibility,
  InternalQueryVisibility extends FunctionVisibility = 'internal',
  InternalMutationVisibility extends FunctionVisibility = 'internal',
  TPrincipal = DefaultPrincipal,
  TActor = DefaultActor,
>(
  builders: AppBuilders<
    DataModel,
    QueryVisibility,
    MutationVisibility,
    InternalQueryVisibility,
    InternalMutationVisibility
  >,
  options: CreateAppOptions<DataModel, TPrincipal, TActor> = {},
) {
  const raw = buildRawFunctions(builders, options)
  const app = buildStructuredFunctions<
    QueryCtxWithRuntime<DataModel, TPrincipal, TActor>,
    MutationCtxWithRuntime<DataModel, TPrincipal, TActor>,
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

  return {
    app: {
      query: app.query,
      mutation: app.mutation,
      ...(structuredInternal
        ? {
            internal: {
              query: structuredInternal.query,
              mutation: structuredInternal.mutation,
            },
          }
        : {}),
    },
    raw: {
      query: raw.query,
      mutation: raw.mutation,
      ...(raw.internal.query || raw.internal.mutation
        ? {
            internal: {
              query: raw.internal.query,
              mutation: raw.internal.mutation,
            },
          }
        : {}),
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
