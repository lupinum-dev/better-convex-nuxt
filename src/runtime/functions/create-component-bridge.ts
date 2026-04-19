import {
  customMutation,
  customQuery,
  type Customization,
} from 'convex-helpers/server/customFunctions'
import type {
  FunctionVisibility,
  FunctionReference,
  FunctionReturnType,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
  MutationBuilder,
  QueryBuilder,
  RegisteredMutation,
  RegisteredQuery,
} from 'convex/server'
import type { GenericValidator, ObjectType, PropertyValidators } from 'convex/values'
import { v } from 'convex/values'

import { clearTrustedCallerContext, setTrustedCallerContext } from '../trusted-caller/index.js'
import {
  definePrincipal,
  type DefaultPrincipal,
  type PrincipalDefinition,
} from './define-principal.js'

type AnyCtx<DataModel extends GenericDataModel> =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>

type PrincipalAccessor<TPrincipal> = () => Promise<TPrincipal>

type BridgeCtxExtension<TPrincipal> = {
  principal: PrincipalAccessor<TPrincipal>
}

type QueryCtxWithPrincipal<
  DataModel extends GenericDataModel,
  TPrincipal,
> = GenericQueryCtx<DataModel> & BridgeCtxExtension<TPrincipal>

type MutationCtxWithPrincipal<
  DataModel extends GenericDataModel,
  TPrincipal,
> = GenericMutationCtx<DataModel> & BridgeCtxExtension<TPrincipal>

type CreateComponentBridgeBuilders<
  DataModel extends GenericDataModel,
  QueryVisibility extends FunctionVisibility,
  MutationVisibility extends FunctionVisibility,
  InternalQueryVisibility extends FunctionVisibility,
  InternalMutationVisibility extends FunctionVisibility,
> = {
  query: QueryBuilder<DataModel, QueryVisibility>
  mutation: MutationBuilder<DataModel, MutationVisibility>
  internalQuery: QueryBuilder<DataModel, InternalQueryVisibility>
  internalMutation: MutationBuilder<DataModel, InternalMutationVisibility>
}

type AnyFunctionRef = FunctionReference<'query' | 'mutation', 'public' | 'internal'>
type QueryRef = FunctionReference<'query', 'public' | 'internal'>
type MutationRef = FunctionReference<'mutation', 'public' | 'internal'>

type BridgeDefinition<TRef extends AnyFunctionRef> = {
  args: PropertyValidators
  returns?: GenericValidator
  component: TRef
}

type QueryBridgeBatchDefinition<TRef extends QueryRef = QueryRef> = BridgeDefinition<TRef> & {
  operation: 'query'
}

type MutationBridgeBatchDefinition<TRef extends MutationRef = MutationRef> =
  BridgeDefinition<TRef> & {
    operation: 'mutation'
  }

type InternalQueryBridgeBatchDefinition<TRef extends QueryRef = QueryRef> =
  BridgeDefinition<TRef> & {
    operation: 'internalQuery'
  }

type InternalMutationBridgeBatchDefinition<TRef extends MutationRef = MutationRef> =
  BridgeDefinition<TRef> & {
    operation: 'internalMutation'
  }

type BridgeBatchDefinition =
  | QueryBridgeBatchDefinition
  | MutationBridgeBatchDefinition
  | InternalQueryBridgeBatchDefinition
  | InternalMutationBridgeBatchDefinition

type BridgeBatchDefinitions = Record<string, BridgeBatchDefinition>

type BridgeBatchResult<
  TDefinitions extends BridgeBatchDefinitions,
  QueryVisibility extends FunctionVisibility,
  MutationVisibility extends FunctionVisibility,
  InternalQueryVisibility extends FunctionVisibility,
  InternalMutationVisibility extends FunctionVisibility,
> = {
  [Key in keyof TDefinitions]: TDefinitions[Key] extends {
    operation: 'query'
    args: infer TArgs extends PropertyValidators
    component: infer TRef extends QueryRef
  }
    ? RegisteredQuery<QueryVisibility, ObjectType<TArgs>, Promise<FunctionReturnType<TRef>>>
    : TDefinitions[Key] extends {
          operation: 'mutation'
          args: infer TArgs extends PropertyValidators
          component: infer TRef extends MutationRef
        }
      ? RegisteredMutation<MutationVisibility, ObjectType<TArgs>, Promise<FunctionReturnType<TRef>>>
      : TDefinitions[Key] extends {
            operation: 'internalQuery'
            args: infer TArgs extends PropertyValidators
            component: infer TRef extends QueryRef
          }
        ? RegisteredQuery<
            InternalQueryVisibility,
            ObjectType<TArgs>,
            Promise<FunctionReturnType<TRef>>
          >
        : TDefinitions[Key] extends {
              operation: 'internalMutation'
              args: infer TArgs extends PropertyValidators
              component: infer TRef extends MutationRef
            }
          ? RegisteredMutation<
              InternalMutationVisibility,
              ObjectType<TArgs>,
              Promise<FunctionReturnType<TRef>>
            >
          : never
}

const COMPONENT_BRIDGE_TRUSTED_CALLER_KEY = '__trellis_component_bridge__'

function resolveBridgeTrustedCallerUserId(principal: unknown): string {
  if (typeof principal !== 'object' || principal === null) {
    return 'component-bridge'
  }

  const maybeUserId = (principal as Record<string, unknown>).userId
  return typeof maybeUserId === 'string' && maybeUserId.trim() ? maybeUserId : 'component-bridge'
}

function createBridgeTrustedCallerFields(principal: unknown) {
  const expectedKey =
    process.env.CONVEX_TRUSTED_CALLER_KEY?.trim() || COMPONENT_BRIDGE_TRUSTED_CALLER_KEY

  return {
    _trustedCallerKey: expectedKey,
    _trustedCallerExpectedKey: expectedKey,
    _trustedCaller: {
      userId: resolveBridgeTrustedCallerUserId(principal),
    },
  }
}

function createBridgeCustomization<DataModel extends GenericDataModel, TPrincipal>(
  principalDefinition: PrincipalDefinition<AnyCtx<DataModel>, TPrincipal>,
): {
  query: Customization<
    GenericQueryCtx<DataModel>,
    PropertyValidators,
    QueryCtxWithPrincipal<DataModel, TPrincipal>,
    Record<string, never>
  >
  mutation: Customization<
    GenericMutationCtx<DataModel>,
    PropertyValidators,
    MutationCtxWithPrincipal<DataModel, TPrincipal>,
    Record<string, never>
  >
} {
  const principalArgs: PropertyValidators = principalDefinition.validator
    ? { principal: v.optional(principalDefinition.validator) }
    : {}

  return {
    query: {
      args: principalArgs,
      input: async (ctx, args) => {
        let principalPromise: Promise<TPrincipal> | null = null
        const principal = async () => {
          if (!principalPromise) {
            const forwardedPrincipal = (args as Record<string, unknown>).principal
            const ctxWithTrustedCaller = { ...ctx }
            const argsWithTrustedCaller = {
              ...args,
              ...createBridgeTrustedCallerFields(forwardedPrincipal),
            }

            setTrustedCallerContext(ctxWithTrustedCaller, argsWithTrustedCaller)
            principalPromise = Promise.resolve(
              principalDefinition.resolve(ctxWithTrustedCaller, argsWithTrustedCaller),
            ).finally(() => {
              clearTrustedCallerContext(ctxWithTrustedCaller)
            })
          }

          return await principalPromise
        }

        return {
          ctx: {
            ...ctx,
            principal,
          },
          args: {},
        }
      },
    },
    mutation: {
      args: principalArgs,
      input: async (ctx, args) => {
        let principalPromise: Promise<TPrincipal> | null = null
        const principal = async () => {
          if (!principalPromise) {
            const forwardedPrincipal = (args as Record<string, unknown>).principal
            const ctxWithTrustedCaller = { ...ctx }
            const argsWithTrustedCaller = {
              ...args,
              ...createBridgeTrustedCallerFields(forwardedPrincipal),
            }

            setTrustedCallerContext(ctxWithTrustedCaller, argsWithTrustedCaller)
            principalPromise = Promise.resolve(
              principalDefinition.resolve(ctxWithTrustedCaller, argsWithTrustedCaller),
            ).finally(() => {
              clearTrustedCallerContext(ctxWithTrustedCaller)
            })
          }

          return await principalPromise
        }

        return {
          ctx: {
            ...ctx,
            principal,
          },
          args: {},
        }
      },
    },
  }
}

/**
 * Root seam that forwards explicit principals into component refs.
 *
 * This is an advanced API. Use it when non-browser callers such as Nitro routes,
 * MCP tools, or automations need a durable inventory of root refs that should
 * stay stable even if the internal component layout changes.
 *
 * It forwards identity; it does not replace business authorization.
 */
export function createComponentBridge<
  DataModel extends GenericDataModel,
  QueryVisibility extends FunctionVisibility,
  MutationVisibility extends FunctionVisibility,
  InternalQueryVisibility extends FunctionVisibility,
  InternalMutationVisibility extends FunctionVisibility,
  TPrincipal = DefaultPrincipal,
>(
  builders: CreateComponentBridgeBuilders<
    DataModel,
    QueryVisibility,
    MutationVisibility,
    InternalQueryVisibility,
    InternalMutationVisibility
  >,
  options: {
    principal?: PrincipalDefinition<AnyCtx<DataModel>, TPrincipal>
  } = {},
) {
  const principalDefinition =
    options.principal ??
    (definePrincipal.fromAuth<DataModel>() as PrincipalDefinition<AnyCtx<DataModel>, TPrincipal>)
  const customization = createBridgeCustomization<DataModel, TPrincipal>(principalDefinition)

  const query = customQuery(builders.query, customization.query)
  const mutation = customMutation(builders.mutation, customization.mutation)
  const internalQuery = customQuery(builders.internalQuery, customization.query)
  const internalMutation = customMutation(builders.internalMutation, customization.mutation)

  const registerQuery = <TRef extends QueryRef>(definition: BridgeDefinition<TRef>) =>
    query({
      args: definition.args,
      returns: definition.returns,
      handler: async (ctx, args: ObjectType<typeof definition.args>) => {
        const principal = await ctx.principal()
        return await ctx.runQuery(definition.component, {
          ...args,
          ...createBridgeTrustedCallerFields(principal),
          principal,
        } as never)
      },
    })

  const registerMutation = <TRef extends MutationRef>(definition: BridgeDefinition<TRef>) =>
    mutation({
      args: definition.args,
      returns: definition.returns,
      handler: async (ctx, args: ObjectType<typeof definition.args>) => {
        const principal = await ctx.principal()
        return await ctx.runMutation(definition.component, {
          ...args,
          ...createBridgeTrustedCallerFields(principal),
          principal,
        } as never)
      },
    })

  const registerInternalQuery = <TRef extends QueryRef>(definition: BridgeDefinition<TRef>) =>
    internalQuery({
      args: definition.args,
      returns: definition.returns,
      handler: async (ctx, args: ObjectType<typeof definition.args>) => {
        const principal = await ctx.principal()
        return await ctx.runQuery(definition.component, {
          ...args,
          ...createBridgeTrustedCallerFields(principal),
          principal,
        } as never)
      },
    })

  const registerInternalMutation = <TRef extends MutationRef>(definition: BridgeDefinition<TRef>) =>
    internalMutation({
      args: definition.args,
      returns: definition.returns,
      handler: async (ctx, args: ObjectType<typeof definition.args>) => {
        const principal = await ctx.principal()
        return await ctx.runMutation(definition.component, {
          ...args,
          ...createBridgeTrustedCallerFields(principal),
          principal,
        } as never)
      },
    })

  return {
    query<TRef extends QueryRef>(definition: BridgeDefinition<TRef>) {
      return registerQuery(definition)
    },

    mutation<TRef extends MutationRef>(definition: BridgeDefinition<TRef>) {
      return registerMutation(definition)
    },

    internalQuery<TRef extends QueryRef>(definition: BridgeDefinition<TRef>) {
      return registerInternalQuery(definition)
    },

    internalMutation<TRef extends MutationRef>(definition: BridgeDefinition<TRef>) {
      return registerInternalMutation(definition)
    },

    from<TDefinitions extends BridgeBatchDefinitions>(
      definitions: TDefinitions,
    ): BridgeBatchResult<
      TDefinitions,
      QueryVisibility,
      MutationVisibility,
      InternalQueryVisibility,
      InternalMutationVisibility
    > {
      const entries = Object.entries(definitions).map(([name, definition]) => {
        switch (definition.operation) {
          case 'query':
            return [name, registerQuery(definition)]
          case 'mutation':
            return [name, registerMutation(definition)]
          case 'internalQuery':
            return [name, registerInternalQuery(definition)]
          case 'internalMutation':
            return [name, registerInternalMutation(definition)]
        }
      })

      return Object.fromEntries(entries) as BridgeBatchResult<
        TDefinitions,
        QueryVisibility,
        MutationVisibility,
        InternalQueryVisibility,
        InternalMutationVisibility
      >
    },
  }
}
