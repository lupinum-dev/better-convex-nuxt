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

import { defineActor, type DefaultActor } from '../auth/define-actor.js'
import {
  createTrustedCallerContextDelta,
  extractTrustedCallerFromArgs,
  trustedCallerValidators,
} from '../trusted-caller/shared.js'
import {
  buildStructuredFunctions,
} from './define-handler.js'
import type {
  StructuredGuard,
  StructuredHandlerDefinition,
  StructuredLoadedValue,
} from './define-handler.js'
export type {
  StructuredGuard,
  StructuredHandlerDefinition,
  StructuredLoadedValue,
} from './define-handler.js'

type AnyCtx<DataModel extends GenericDataModel> =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>

export type ActorAccessor<TActor> = () => Promise<TActor | null>

export type FunctionsCtxExtension<TActor> = {
  actor: ActorAccessor<TActor>
}

type AnyCtxWithActor<DataModel extends GenericDataModel, TActor> = AnyCtx<DataModel> &
  FunctionsCtxExtension<TActor>

type QueryCtxWithActor<DataModel extends GenericDataModel, TActor> = GenericQueryCtx<DataModel> &
  FunctionsCtxExtension<TActor>

type MutationCtxWithActor<DataModel extends GenericDataModel, TActor> =
  GenericMutationCtx<DataModel> & FunctionsCtxExtension<TActor>

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

type QueryCustomizationCtx<DataModel extends GenericDataModel, TActor> =
  GenericQueryCtx<DataModel> &
  FunctionsCtxExtension<TActor>

type MutationCustomizationCtx<DataModel extends GenericDataModel, TActor> =
  GenericMutationCtx<DataModel> &
  FunctionsCtxExtension<TActor>

export interface CreateAppOptions<DataModel extends GenericDataModel, TActor = DefaultActor> {
  trustedCaller?: boolean
  /**
   * Explicit trusted caller key to use for verification. Useful when running inside
   * a Convex component where `process.env` is not accessible — read the key at module
   * initialization time in the root app and pass it here.
   */
  trustedCallerKey?: string
  actor?: (ctx: AnyCtx<DataModel>, args: Record<string, unknown>) => Promise<TActor | null>
  contextArgs?: PropertyValidators
  tenantIsolation?: TenantIsolationOptions<DataModel>
  rls?: {
    rules: MaybeRules<AnyCtxWithActor<DataModel, TActor>, DataModel>
    config?: RLSConfig
  }
  triggers?: Triggers<DataModel, GenericMutationCtx<DataModel> & FunctionsCtxExtension<TActor>>
  onSuccess?: {
    query?: (args: OnSuccessArgs<AnyCtxWithActor<DataModel, TActor>>) => Promise<void> | void
    mutation?: (args: OnSuccessArgs<AnyCtxWithActor<DataModel, TActor>>) => Promise<void> | void
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
  TActor,
  TDoc extends Record<string, unknown>,
>(field: string) {
  return async (ctx: AnyCtxWithActor<DataModel, TActor>, doc: TDoc) => {
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

function buildTenantIsolationRules<DataModel extends GenericDataModel, TActor>(
  options: TenantIsolationOptions<DataModel> | undefined,
): Rules<AnyCtxWithActor<DataModel, TActor>, DataModel> {
  const rules = {} as Rules<AnyCtxWithActor<DataModel, TActor>, DataModel>
  if (!options) return rules

  const field = options.field ?? 'workspaceId'

  for (const table of options.tables) {
    const tenantRule = createTenantIsolationRule<DataModel, TActor, Record<string, unknown>>(field)
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

async function resolveRules<DataModel extends GenericDataModel, TActor>(
  ctx: AnyCtxWithActor<DataModel, TActor>,
  options: CreateAppOptions<DataModel, TActor>,
): Promise<Rules<AnyCtxWithActor<DataModel, TActor>, DataModel> | null> {
  const tenantRules = buildTenantIsolationRules<DataModel, TActor>(options.tenantIsolation)
  const hasTenantRules = Object.keys(tenantRules).length > 0
  const rlsRules = options.rls?.rules

  if (!hasTenantRules && !rlsRules) return null

  const resolvedCustomRules =
    typeof rlsRules === 'function' ? await rlsRules(ctx) : (rlsRules ?? {})

  return mergeRules(tenantRules, resolvedCustomRules)
}

type StructuredQueryBuilder<
  TCtx extends object,
  Visibility extends FunctionVisibility,
  TActor,
> = <
  TGuard extends StructuredGuard<TActor>,
  TArgsValidator extends PropertyValidators,
  TLoaded extends StructuredLoadedValue = undefined,
  TResult = unknown,
>(
  definition: StructuredHandlerDefinition<
    TCtx,
    TActor,
    TGuard,
    TArgsValidator,
    TLoaded,
    TResult
  >,
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
  definition: StructuredHandlerDefinition<
    TCtx,
    TActor,
    TGuard,
    TArgsValidator,
    TLoaded,
    TResult
  >,
) => RegisteredMutation<Visibility, ObjectType<TArgsValidator>, TResult>

function resolveActor<DataModel extends GenericDataModel, TActor>(
  options: CreateAppOptions<DataModel, TActor>,
): (ctx: AnyCtx<DataModel>, args: Record<string, unknown>) => Promise<TActor | null> {
  return (options.actor ?? defineActor.fromAuth<DataModel>().resolve) as (
    ctx: AnyCtx<DataModel>,
    args: Record<string, unknown>,
  ) => Promise<TActor | null>
}

function createContextWithActor<DataModel extends GenericDataModel, TActor, TCtx extends AnyCtx<DataModel>>(
  ctx: TCtx,
  args: Record<string, unknown>,
  actorResolver: (ctx: AnyCtx<DataModel>, args: Record<string, unknown>) => Promise<TActor | null>,
  trustedCallerEnabled: boolean,
  trustedCallerKey?: string,
): {
  actor: ActorAccessor<TActor>
  baseCtx: TCtx & FunctionsCtxExtension<TActor>
  trustedCallerContext: ReturnType<typeof createTrustedCallerContextDelta>
} {
  const trustedCaller = trustedCallerEnabled ? extractTrustedCallerFromArgs(args, trustedCallerKey) : null
  const trustedCallerContext = createTrustedCallerContextDelta(trustedCaller)
  const ctxWithTrustedCaller = {
    ...ctx,
    ...trustedCallerContext,
  } as TCtx

  let actorPromise: Promise<TActor | null> | null = null
  const actor: ActorAccessor<TActor> = async () => {
    actorPromise ??= actorResolver(ctxWithTrustedCaller, args)
    return await actorPromise
  }

  return {
    actor,
    baseCtx: {
      ...ctxWithTrustedCaller,
      actor,
    } as TCtx & FunctionsCtxExtension<TActor>,
    trustedCallerContext,
  }
}

function createOnSuccessHandler<Ctx>(
  handler: ((args: OnSuccessArgs<Ctx>) => Promise<void> | void) | undefined,
  ctx: Ctx,
):
  | ((payload: { args: Record<string, unknown>; result: unknown }) => Promise<void>)
  | undefined {
  if (!handler) return undefined

  return async ({ args, result }) => {
    await handler({
      ctx,
      args,
      result,
    })
  }
}

function createQueryCustomization<DataModel extends GenericDataModel, TActor>(
  options: CreateAppOptions<DataModel, TActor>,
): Customization<
  GenericQueryCtx<DataModel>,
  PropertyValidators,
  QueryCustomizationCtx<DataModel, TActor>,
  Record<string, never>
> {
  const actorResolver = resolveActor(options)
  const trustedCallerEnabled = options.trustedCaller ?? true

  return {
    args: {
      ...(trustedCallerEnabled ? trustedCallerValidators : {}),
      ...(options.contextArgs ?? {}),
    },
    input: async (ctx, args) => {
      const { baseCtx } = createContextWithActor(
        ctx,
        args,
        actorResolver,
        trustedCallerEnabled,
        options.trustedCallerKey,
      )
      const resolvedRules = await resolveRules(baseCtx, options)
      const db = resolvedRules
        ? wrapDatabaseReader(baseCtx, ctx.db, resolvedRules, options.rls?.config)
        : ctx.db
      const finalCtx: QueryCtxWithActor<DataModel, TActor> = {
        ...baseCtx,
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

function createMutationCustomization<DataModel extends GenericDataModel, TActor>(
  options: CreateAppOptions<DataModel, TActor>,
): Customization<
  GenericMutationCtx<DataModel>,
  PropertyValidators,
  MutationCustomizationCtx<DataModel, TActor>,
  Record<string, never>
> {
  const actorResolver = resolveActor(options)
  const trustedCallerEnabled = options.trustedCaller ?? true

  return {
    args: {
      ...(trustedCallerEnabled ? trustedCallerValidators : {}),
      ...(options.contextArgs ?? {}),
    },
    input: async (ctx, args) => {
      const { baseCtx } = createContextWithActor(
        ctx,
        args,
        actorResolver,
        trustedCallerEnabled,
        options.trustedCallerKey,
      )
      const resolvedRules = await resolveRules(baseCtx, options)
      let db = resolvedRules
        ? wrapDatabaseWriter(baseCtx, ctx.db, resolvedRules, options.rls?.config)
        : ctx.db

      if (options.triggers) {
        db = options.triggers.wrapDB({
          ...baseCtx,
          db,
        }).db
      }

      const finalCtx: MutationCtxWithActor<DataModel, TActor> = {
        ...baseCtx,
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
  TActor = DefaultActor,
>(
  query: QueryBuilder<DataModel, QueryVisibility>,
  mutation: MutationBuilder<DataModel, MutationVisibility>,
  options: CreateAppOptions<DataModel, TActor> = {},
) {
  validateTenantIsolationOptions(options.tenantIsolation)

  return {
    query: customQuery(query, createQueryCustomization(options)),
    mutation: customMutation(mutation, createMutationCustomization(options)),
  }
}

export function createApp<
  DataModel extends GenericDataModel,
  QueryVisibility extends FunctionVisibility,
  MutationVisibility extends FunctionVisibility,
  TActor = DefaultActor,
>(
  query: QueryBuilder<DataModel, QueryVisibility>,
  mutation: MutationBuilder<DataModel, MutationVisibility>,
  options: CreateAppOptions<DataModel, TActor> = {},
) {
  const raw = buildRawFunctions(query, mutation, options)
  const app = buildStructuredFunctions<
    QueryCtxWithActor<DataModel, TActor>,
    MutationCtxWithActor<DataModel, TActor>,
    TActor
  >(raw.query, raw.mutation) as {
    query: StructuredQueryBuilder<QueryCtxWithActor<DataModel, TActor>, QueryVisibility, TActor>
    mutation: StructuredMutationBuilder<
      MutationCtxWithActor<DataModel, TActor>,
      MutationVisibility,
      TActor
    >
  }

  return {
    app,
    raw,
  }
}
