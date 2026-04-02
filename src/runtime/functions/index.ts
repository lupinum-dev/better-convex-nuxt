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
  TableNamesInDataModel,
} from 'convex/server'
import type { PropertyValidators } from 'convex/values'

import { createDefaultGetActor, type DefaultActor } from '../auth/define-actor'
import {
  createTrustedCallerContextDelta,
  extractTrustedCallerFromArgs,
  trustedCallerValidators,
} from '../trusted-caller/shared'

type AnyCtx<DataModel extends GenericDataModel> =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>

export type ActorAccessor<TActor> = () => Promise<TActor | null>

export type FunctionsCtxExtension<TActor> = {
  actor: ActorAccessor<TActor>
}

type AnyCtxWithActor<DataModel extends GenericDataModel, TActor> = AnyCtx<DataModel> &
  FunctionsCtxExtension<TActor>

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

export interface CreateFunctionsOptions<DataModel extends GenericDataModel, TActor = DefaultActor> {
  trustedCaller?: boolean
  actor?: (ctx: AnyCtx<DataModel>) => Promise<TActor | null>
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

function createTenantIsolationRule<
  DataModel extends GenericDataModel,
  TActor,
  TDoc extends Record<string, unknown>,
>(field: string) {
  return async (ctx: AnyCtxWithActor<DataModel, TActor>, doc: TDoc) => {
    const actorTenantId = getTenantId(await ctx.actor())
    const documentTenantId = doc[field as keyof TDoc]

    if (documentTenantId === actorTenantId) {
      return true
    }

    if (process.env.NODE_ENV === 'production') {
      return false
    }

    throw new Error(
      `Document belongs to a different tenant.\nReason: ${field} ${String(documentTenantId)}`,
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
  options: CreateFunctionsOptions<DataModel, TActor>,
): Promise<Rules<AnyCtxWithActor<DataModel, TActor>, DataModel> | null> {
  const tenantRules = buildTenantIsolationRules<DataModel, TActor>(options.tenantIsolation)
  const hasTenantRules = Object.keys(tenantRules).length > 0
  const rlsRules = options.rls?.rules

  if (!hasTenantRules && !rlsRules) return null

  const resolvedCustomRules =
    typeof rlsRules === 'function' ? await rlsRules(ctx) : (rlsRules ?? {})

  return mergeRules(tenantRules, resolvedCustomRules)
}

type CustomCtxDelta<DataModel extends GenericDataModel, TActor> = FunctionsCtxExtension<TActor> & {
  db?: GenericQueryCtx<DataModel>['db'] | GenericMutationCtx<DataModel>['db']
}

function createCustomization<
  DataModel extends GenericDataModel,
  TActor,
  TCtx extends AnyCtx<DataModel>,
>(
  kind: 'query' | 'mutation',
  options: CreateFunctionsOptions<DataModel, TActor>,
): Customization<
  TCtx,
  PropertyValidators,
  CustomCtxDelta<DataModel, TActor> & Record<PropertyKey, unknown>,
  Record<string, never>
> {
  const actorResolver = (options.actor ?? createDefaultGetActor<DataModel>()) as (
    ctx: AnyCtx<DataModel>,
  ) => Promise<TActor | null>

  return {
    args: (options.trustedCaller ?? true) ? trustedCallerValidators : {},
    input: async (ctx, args) => {
      const trustedCaller =
        (options.trustedCaller ?? true) ? extractTrustedCallerFromArgs(args) : null
      const trustedCallerContext = createTrustedCallerContextDelta(trustedCaller)
      const ctxWithTrustedCaller = {
        ...ctx,
        ...trustedCallerContext,
      } as TCtx

      let actorPromise: Promise<TActor | null> | null = null
      const actor = async () => {
        actorPromise ??= actorResolver(ctxWithTrustedCaller)
        return await actorPromise
      }

      const baseCtx = {
        ...ctxWithTrustedCaller,
        actor,
      } as AnyCtxWithActor<DataModel, TActor>

      const resolvedRules = await resolveRules(baseCtx, options)
      let db = ctx.db

      if (resolvedRules) {
        if (kind === 'query') {
          db = wrapDatabaseReader(
            baseCtx,
            db as GenericQueryCtx<DataModel>['db'],
            resolvedRules,
            options.rls?.config,
          ) as typeof db
        } else {
          db = wrapDatabaseWriter(
            baseCtx,
            db as GenericMutationCtx<DataModel>['db'],
            resolvedRules,
            options.rls?.config,
          ) as typeof db
        }
      }

      if (kind === 'mutation' && options.triggers) {
        db = options.triggers.wrapDB({
          ...(baseCtx as GenericMutationCtx<DataModel> & FunctionsCtxExtension<TActor>),
          db: db as GenericMutationCtx<DataModel>['db'],
        }).db as typeof db
      }

      const finalCtx = {
        ...baseCtx,
        db,
      } as AnyCtxWithActor<DataModel, TActor>

      const onSuccessHandler =
        kind === 'query' ? options.onSuccess?.query : options.onSuccess?.mutation

      return {
        ctx: {
          ...trustedCallerContext,
          actor,
          db,
        },
        args: {},
        onSuccess: onSuccessHandler
          ? async ({ args: handlerArgs, result }) => {
              await onSuccessHandler({
                ctx: finalCtx,
                args: handlerArgs,
                result,
              })
            }
          : undefined,
      }
    },
  }
}

export function createFunctions<
  DataModel extends GenericDataModel,
  QueryVisibility extends FunctionVisibility,
  MutationVisibility extends FunctionVisibility,
  TActor = DefaultActor,
>(
  query: QueryBuilder<DataModel, QueryVisibility>,
  mutation: MutationBuilder<DataModel, MutationVisibility>,
  options: CreateFunctionsOptions<DataModel, TActor> = {},
) {
  validateTenantIsolationOptions(options.tenantIsolation)

  return {
    query: customQuery(
      query,
      createCustomization<DataModel, TActor, GenericQueryCtx<DataModel>>('query', options),
    ),
    mutation: customMutation(
      mutation,
      createCustomization<DataModel, TActor, GenericMutationCtx<DataModel>>('mutation', options),
    ),
  }
}
