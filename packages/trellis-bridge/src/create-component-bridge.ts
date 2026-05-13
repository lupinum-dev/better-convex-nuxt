import { defineCaller, type DefaultCaller, type CallerDefinition } from '@lupinum/trellis/backend'
import {
  clearIdentityForwardingContext,
  setIdentityForwardingContext,
  withIdentityForwarding,
} from '@lupinum/trellis/backend'
import {
  customAction,
  customMutation,
  customQuery,
  type Customization,
} from 'convex-helpers/server/customFunctions'
import type {
  ActionBuilder,
  FunctionVisibility,
  FunctionReference,
  FunctionReturnType,
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
  RegisteredAction,
  MutationBuilder,
  QueryBuilder,
  RegisteredMutation,
  RegisteredQuery,
} from 'convex/server'
import type { GenericValidator, ObjectType, PropertyValidators } from 'convex/values'
import { v } from 'convex/values'

import {
  createBridgeForwardingArgs,
  getBridgeFunctionRef,
  getRequiredBridgeIdentityForwardingKey,
  type IdentityForwardingKeyInput,
} from './bridge-forwarding.js'
export {
  createBridgeForwardingArgs,
  createBridgeForwardingEnvelope,
  type CreateBridgeForwardingEnvelopeOptions,
  type IdentityForwardingKeyInput,
} from './bridge-forwarding.js'

type AnyCtx<DataModel extends GenericDataModel> =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>
  | GenericActionCtx<DataModel>

type CallerAccessor<TCaller> = () => Promise<TCaller>

type BridgeCtxExtension<TCaller> = {
  caller: CallerAccessor<TCaller>
}

type QueryCtxWithCaller<DataModel extends GenericDataModel, TCaller> = GenericQueryCtx<DataModel> &
  BridgeCtxExtension<TCaller>

type MutationCtxWithCaller<
  DataModel extends GenericDataModel,
  TCaller,
> = GenericMutationCtx<DataModel> & BridgeCtxExtension<TCaller>

type ActionCtxWithCaller<
  DataModel extends GenericDataModel,
  TCaller,
> = GenericActionCtx<DataModel> & BridgeCtxExtension<TCaller>

type CreateComponentBridgeBuilders<
  DataModel extends GenericDataModel,
  QueryVisibility extends FunctionVisibility,
  MutationVisibility extends FunctionVisibility,
  InternalQueryVisibility extends FunctionVisibility,
  InternalMutationVisibility extends FunctionVisibility,
  ActionVisibility extends FunctionVisibility,
  InternalActionVisibility extends FunctionVisibility,
> = {
  query: QueryBuilder<DataModel, QueryVisibility>
  mutation: MutationBuilder<DataModel, MutationVisibility>
  action?: ActionBuilder<DataModel, ActionVisibility>
  internalQuery: QueryBuilder<DataModel, InternalQueryVisibility>
  internalMutation: MutationBuilder<DataModel, InternalMutationVisibility>
  internalAction?: ActionBuilder<DataModel, InternalActionVisibility>
}

type ComponentBridgeFunctionRef = FunctionReference<
  'query' | 'mutation' | 'action',
  'public' | 'internal'
>
type BridgeForwardingPurpose = 'query' | 'mutation' | 'action' | 'operation-execute'
type ComponentBridgeQueryRef = FunctionReference<'query', 'public' | 'internal'>
type ComponentBridgeMutationRef = FunctionReference<'mutation', 'public' | 'internal'>
type ComponentBridgeActionRef = FunctionReference<'action', 'public' | 'internal'>

type ComponentBridgeDefinition<
  TRef extends ComponentBridgeFunctionRef,
  TArgs extends PropertyValidators = PropertyValidators,
> = {
  args: TArgs
  returns?: GenericValidator
  component: TRef
  functionRef?: string
  forwardIdentity?: boolean
  forwardingPurpose?: BridgeForwardingPurpose
} & Record<never, never>

type ComponentBridgeQueryDefinition<
  TRef extends ComponentBridgeQueryRef = ComponentBridgeQueryRef,
  TArgs extends PropertyValidators = PropertyValidators,
> = ComponentBridgeDefinition<TRef, TArgs>

type ComponentBridgeMutationDefinition<
  TRef extends ComponentBridgeMutationRef = ComponentBridgeMutationRef,
  TArgs extends PropertyValidators = PropertyValidators,
> = ComponentBridgeDefinition<TRef, TArgs>

type ComponentBridgeActionDefinition<
  TRef extends ComponentBridgeActionRef = ComponentBridgeActionRef,
  TArgs extends PropertyValidators = PropertyValidators,
> = ComponentBridgeDefinition<TRef, TArgs>

export type ComponentBridgeQueryRegistrar<
  Visibility extends FunctionVisibility = FunctionVisibility,
> = <TRef extends ComponentBridgeQueryRef, TArgs extends PropertyValidators>(
  definition: ComponentBridgeQueryDefinition<TRef, TArgs>,
) => RegisteredQuery<Visibility, ObjectType<TArgs>, Promise<FunctionReturnType<TRef>>>

export type ComponentBridgeMutationRegistrar<
  Visibility extends FunctionVisibility = FunctionVisibility,
> = <TRef extends ComponentBridgeMutationRef, TArgs extends PropertyValidators>(
  definition: ComponentBridgeMutationDefinition<TRef, TArgs>,
) => RegisteredMutation<Visibility, ObjectType<TArgs>, Promise<FunctionReturnType<TRef>>>

export type ComponentBridgeActionRegistrar<
  Visibility extends FunctionVisibility = FunctionVisibility,
> = <TRef extends ComponentBridgeActionRef, TArgs extends PropertyValidators>(
  definition: ComponentBridgeActionDefinition<TRef, TArgs>,
) => RegisteredAction<Visibility, ObjectType<TArgs>, Promise<FunctionReturnType<TRef>>>

export type ComponentBridgeComponent<
  QueryVisibility extends FunctionVisibility = FunctionVisibility,
  MutationVisibility extends FunctionVisibility = FunctionVisibility,
  InternalQueryVisibility extends FunctionVisibility = FunctionVisibility,
  InternalMutationVisibility extends FunctionVisibility = FunctionVisibility,
  ActionVisibility extends FunctionVisibility = FunctionVisibility,
  InternalActionVisibility extends FunctionVisibility = FunctionVisibility,
> = {
  query: ComponentBridgeQueryRegistrar<QueryVisibility>
  mutation: ComponentBridgeMutationRegistrar<MutationVisibility>
  internalQuery: ComponentBridgeQueryRegistrar<InternalQueryVisibility>
  internalMutation: ComponentBridgeMutationRegistrar<InternalMutationVisibility>
  action?: ComponentBridgeActionRegistrar<ActionVisibility>
  internalAction?: ComponentBridgeActionRegistrar<InternalActionVisibility>
}

export function callComponentBridgeRegistrar<
  TRef extends ComponentBridgeQueryRef,
  TArgs extends PropertyValidators,
  TResult,
>(
  registrar: (definition: ComponentBridgeQueryDefinition<TRef, TArgs>) => TResult,
  definition: ComponentBridgeQueryDefinition<TRef, TArgs>,
): TResult
export function callComponentBridgeRegistrar<
  TRef extends ComponentBridgeMutationRef,
  TArgs extends PropertyValidators,
  TResult,
>(
  registrar: (definition: ComponentBridgeMutationDefinition<TRef, TArgs>) => TResult,
  definition: ComponentBridgeMutationDefinition<TRef, TArgs>,
): TResult
export function callComponentBridgeRegistrar<
  TRef extends ComponentBridgeActionRef,
  TArgs extends PropertyValidators,
  TResult,
>(
  registrar: (definition: ComponentBridgeActionDefinition<TRef, TArgs>) => TResult,
  definition: ComponentBridgeActionDefinition<TRef, TArgs>,
): TResult
export function callComponentBridgeRegistrar(
  registrar: (definition: ComponentBridgeDefinition<ComponentBridgeFunctionRef>) => unknown,
  definition: ComponentBridgeDefinition<ComponentBridgeFunctionRef>,
): unknown {
  return registrar(definition)
}

type QueryBridgeBatchDefinition<TRef extends ComponentBridgeQueryRef = ComponentBridgeQueryRef> =
  ComponentBridgeDefinition<TRef> & {
    operation: 'query'
  }

type MutationBridgeBatchDefinition<
  TRef extends ComponentBridgeMutationRef = ComponentBridgeMutationRef,
> = ComponentBridgeDefinition<TRef> & {
  operation: 'mutation'
}

type ActionBridgeBatchDefinition<TRef extends ComponentBridgeActionRef = ComponentBridgeActionRef> =
  ComponentBridgeDefinition<TRef> & {
    operation: 'action'
  }

type InternalQueryBridgeBatchDefinition<
  TRef extends ComponentBridgeQueryRef = ComponentBridgeQueryRef,
> = ComponentBridgeDefinition<TRef> & {
  operation: 'internalQuery'
}

type InternalMutationBridgeBatchDefinition<
  TRef extends ComponentBridgeMutationRef = ComponentBridgeMutationRef,
> = ComponentBridgeDefinition<TRef> & {
  operation: 'internalMutation'
}

type InternalActionBridgeBatchDefinition<
  TRef extends ComponentBridgeActionRef = ComponentBridgeActionRef,
> = ComponentBridgeDefinition<TRef> & {
  operation: 'internalAction'
}

type BridgeBatchDefinition =
  | QueryBridgeBatchDefinition
  | MutationBridgeBatchDefinition
  | ActionBridgeBatchDefinition
  | InternalQueryBridgeBatchDefinition
  | InternalMutationBridgeBatchDefinition
  | InternalActionBridgeBatchDefinition

type BridgeBatchDefinitions = Record<string, BridgeBatchDefinition>

type BridgeBatchResult<
  TDefinitions extends BridgeBatchDefinitions,
  QueryVisibility extends FunctionVisibility,
  MutationVisibility extends FunctionVisibility,
  InternalQueryVisibility extends FunctionVisibility,
  InternalMutationVisibility extends FunctionVisibility,
  ActionVisibility extends FunctionVisibility,
  InternalActionVisibility extends FunctionVisibility,
> = {
  [Key in keyof TDefinitions]: TDefinitions[Key] extends {
    operation: 'query'
    args: infer TArgs extends PropertyValidators
    component: infer TRef extends ComponentBridgeQueryRef
  }
    ? RegisteredQuery<QueryVisibility, ObjectType<TArgs>, Promise<FunctionReturnType<TRef>>>
    : TDefinitions[Key] extends {
          operation: 'mutation'
          args: infer TArgs extends PropertyValidators
          component: infer TRef extends ComponentBridgeMutationRef
        }
      ? RegisteredMutation<MutationVisibility, ObjectType<TArgs>, Promise<FunctionReturnType<TRef>>>
      : TDefinitions[Key] extends {
            operation: 'action'
            args: infer TArgs extends PropertyValidators
            component: infer TRef extends ComponentBridgeActionRef
          }
        ? RegisteredAction<ActionVisibility, ObjectType<TArgs>, Promise<FunctionReturnType<TRef>>>
        : TDefinitions[Key] extends {
              operation: 'internalQuery'
              args: infer TArgs extends PropertyValidators
              component: infer TRef extends ComponentBridgeQueryRef
            }
          ? RegisteredQuery<
              InternalQueryVisibility,
              ObjectType<TArgs>,
              Promise<FunctionReturnType<TRef>>
            >
          : TDefinitions[Key] extends {
                operation: 'internalMutation'
                args: infer TArgs extends PropertyValidators
                component: infer TRef extends ComponentBridgeMutationRef
              }
            ? RegisteredMutation<
                InternalMutationVisibility,
                ObjectType<TArgs>,
                Promise<FunctionReturnType<TRef>>
              >
            : TDefinitions[Key] extends {
                  operation: 'internalAction'
                  args: infer TArgs extends PropertyValidators
                  component: infer TRef extends ComponentBridgeActionRef
                }
              ? RegisteredAction<
                  InternalActionVisibility,
                  ObjectType<TArgs>,
                  Promise<FunctionReturnType<TRef>>
                >
              : never
}

function createPublicBridgeCustomization<DataModel extends GenericDataModel, TCaller>(
  callerDefinition: CallerDefinition<AnyCtx<DataModel>, TCaller>,
  expectedFunctionRef: string,
): {
  query: Customization<
    GenericQueryCtx<DataModel>,
    PropertyValidators,
    QueryCtxWithCaller<DataModel, TCaller>,
    Record<string, never>
  >
  mutation: Customization<
    GenericMutationCtx<DataModel>,
    PropertyValidators,
    MutationCtxWithCaller<DataModel, TCaller>,
    Record<string, never>
  >
  action: Customization<
    GenericActionCtx<DataModel>,
    PropertyValidators,
    ActionCtxWithCaller<DataModel, TCaller>,
    Record<string, never>
  >
} {
  return {
    query: {
      args: {},
      input: createBridgeCallerInput<
        DataModel,
        TCaller,
        GenericQueryCtx<DataModel>,
        QueryCtxWithCaller<DataModel, TCaller>
      >(callerDefinition, expectedFunctionRef, 'query'),
    },
    mutation: {
      args: {},
      input: createBridgeCallerInput<
        DataModel,
        TCaller,
        GenericMutationCtx<DataModel>,
        MutationCtxWithCaller<DataModel, TCaller>
      >(callerDefinition, expectedFunctionRef, 'mutation'),
    },
    action: {
      args: {},
      input: createBridgeCallerInput<
        DataModel,
        TCaller,
        GenericActionCtx<DataModel>,
        ActionCtxWithCaller<DataModel, TCaller>
      >(callerDefinition, expectedFunctionRef, 'action'),
    },
  }
}

function createBridgeCallerInput<
  DataModel extends GenericDataModel,
  TCaller,
  TCtx extends AnyCtx<DataModel>,
  TOutputCtx extends TCtx & BridgeCtxExtension<TCaller>,
>(
  callerDefinition: CallerDefinition<AnyCtx<DataModel>, TCaller>,
  expectedFunctionRef: string,
  expectedPurpose: 'query' | 'mutation' | 'action',
  identityForwardingKeyOverride?: IdentityForwardingKeyInput,
) {
  return async (ctx: TCtx, args: Record<string, unknown>) => {
    let callerPromise: Promise<TCaller> | null = null
    const caller = async () => {
      if (!callerPromise) {
        const ctxWithIdentityForwarding = { ...ctx } as TCtx
        setIdentityForwardingContext(ctxWithIdentityForwarding, args, {
          expectedKeyOverride: identityForwardingKeyOverride,
          expectedPurpose,
          expectedTransport: 'bridge',
          expectedFunctionRef,
        })
        callerPromise = Promise.resolve(
          callerDefinition.resolve(ctxWithIdentityForwarding, args),
        ).finally(() => {
          clearIdentityForwardingContext(ctxWithIdentityForwarding)
        })
      }

      return await callerPromise
    }

    return {
      ctx: {
        ...ctx,
        caller,
      } as TOutputCtx,
      args: {} as Record<string, never>,
    }
  }
}

function createInternalBridgeCustomization<DataModel extends GenericDataModel, TCaller>(
  callerDefinition: CallerDefinition<AnyCtx<DataModel>, TCaller>,
  expectedFunctionRef: string,
  identityForwardingKeyOverride?: IdentityForwardingKeyInput,
): {
  query: Customization<
    GenericQueryCtx<DataModel>,
    PropertyValidators,
    QueryCtxWithCaller<DataModel, TCaller>,
    Record<string, never>
  >
  mutation: Customization<
    GenericMutationCtx<DataModel>,
    PropertyValidators,
    MutationCtxWithCaller<DataModel, TCaller>,
    Record<string, never>
  >
  action: Customization<
    GenericActionCtx<DataModel>,
    PropertyValidators,
    ActionCtxWithCaller<DataModel, TCaller>,
    Record<string, never>
  >
} {
  const forwardingArgs: PropertyValidators = withIdentityForwarding({})

  return {
    query: {
      args: forwardingArgs,
      input: createBridgeCallerInput<
        DataModel,
        TCaller,
        GenericQueryCtx<DataModel>,
        QueryCtxWithCaller<DataModel, TCaller>
      >(callerDefinition, expectedFunctionRef, 'query', identityForwardingKeyOverride),
    },
    mutation: {
      args: forwardingArgs,
      input: createBridgeCallerInput<
        DataModel,
        TCaller,
        GenericMutationCtx<DataModel>,
        MutationCtxWithCaller<DataModel, TCaller>
      >(callerDefinition, expectedFunctionRef, 'mutation', identityForwardingKeyOverride),
    },
    action: {
      args: forwardingArgs,
      input: createBridgeCallerInput<
        DataModel,
        TCaller,
        GenericActionCtx<DataModel>,
        ActionCtxWithCaller<DataModel, TCaller>
      >(callerDefinition, expectedFunctionRef, 'action', identityForwardingKeyOverride),
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
  ActionVisibility extends FunctionVisibility = FunctionVisibility,
  InternalActionVisibility extends FunctionVisibility = FunctionVisibility,
  TCaller = DefaultCaller,
>(
  builders: CreateComponentBridgeBuilders<
    DataModel,
    QueryVisibility,
    MutationVisibility,
    InternalQueryVisibility,
    InternalMutationVisibility,
    ActionVisibility,
    InternalActionVisibility
  >,
  options: {
    caller?: CallerDefinition<AnyCtx<DataModel>, TCaller>
    identityForwardingKey?: IdentityForwardingKeyInput
  } = {},
) {
  const callerDefinition =
    options.caller ??
    (defineCaller.fromAuth<DataModel>() as CallerDefinition<AnyCtx<DataModel>, TCaller>)

  const registerQuery = <TRef extends ComponentBridgeQueryRef>(
    definition: ComponentBridgeDefinition<TRef>,
  ) => {
    const functionRef = getBridgeFunctionRef(definition.component, definition.functionRef)
    const customization = createPublicBridgeCustomization<DataModel, TCaller>(
      callerDefinition,
      functionRef,
    )
    const query = customQuery(builders.query, customization.query)
    return query({
      args: definition.args,
      returns: definition.returns,
      handler: async (ctx, args: ObjectType<typeof definition.args>) => {
        const caller = await ctx.caller()
        if (definition.forwardIdentity === false) {
          return await ctx.runQuery(definition.component, args as never)
        }
        return await ctx.runQuery(
          definition.component,
          createBridgeForwardingArgs(
            args as Record<string, unknown>,
            caller,
            (input) => getRequiredBridgeIdentityForwardingKey(options.identityForwardingKey, input),
            'query',
            definition.component,
            functionRef,
          ) as never,
        )
      },
    })
  }

  const registerMutation = <TRef extends ComponentBridgeMutationRef>(
    definition: ComponentBridgeDefinition<TRef>,
  ) => {
    const functionRef = getBridgeFunctionRef(definition.component, definition.functionRef)
    const customization = createPublicBridgeCustomization<DataModel, TCaller>(
      callerDefinition,
      functionRef,
    )
    const mutation = customMutation(builders.mutation, customization.mutation)
    return mutation({
      args: definition.args,
      returns: definition.returns,
      handler: async (ctx, args: ObjectType<typeof definition.args>) => {
        const caller = await ctx.caller()
        if (definition.forwardIdentity === false) {
          return await ctx.runMutation(definition.component, args as never)
        }
        return await ctx.runMutation(
          definition.component,
          createBridgeForwardingArgs(
            args as Record<string, unknown>,
            caller,
            (input) => getRequiredBridgeIdentityForwardingKey(options.identityForwardingKey, input),
            definition.forwardingPurpose ?? 'mutation',
            definition.component,
            functionRef,
          ) as never,
        )
      },
    })
  }

  const registerAction = <TRef extends ComponentBridgeActionRef>(
    definition: ComponentBridgeDefinition<TRef>,
  ) => {
    if (!builders.action) {
      throw new Error('createComponentBridge() was not configured with an action builder.')
    }
    const functionRef = getBridgeFunctionRef(definition.component, definition.functionRef)
    const customization = createPublicBridgeCustomization<DataModel, TCaller>(
      callerDefinition,
      functionRef,
    )
    const action = customAction(builders.action, customization.action)
    return action({
      args: definition.args,
      returns: definition.returns,
      handler: async (ctx, args: ObjectType<typeof definition.args>) => {
        const caller = await ctx.caller()
        if (definition.forwardIdentity === false) {
          return await ctx.runAction(definition.component, args as never)
        }
        return await ctx.runAction(
          definition.component,
          createBridgeForwardingArgs(
            args as Record<string, unknown>,
            caller,
            (input) => getRequiredBridgeIdentityForwardingKey(options.identityForwardingKey, input),
            'action',
            definition.component,
            functionRef,
          ) as never,
        )
      },
    })
  }

  const registerInternalQuery = <TRef extends ComponentBridgeQueryRef>(
    definition: ComponentBridgeDefinition<TRef>,
  ) => {
    const functionRef = getBridgeFunctionRef(definition.component, definition.functionRef)
    const customization = createInternalBridgeCustomization<DataModel, TCaller>(
      callerDefinition,
      functionRef,
      options.identityForwardingKey,
    )
    const internalQuery = customQuery(builders.internalQuery, customization.query)
    return internalQuery({
      args: definition.args,
      returns: definition.returns,
      handler: async (ctx, args: ObjectType<typeof definition.args>) => {
        const caller = await ctx.caller()
        if (definition.forwardIdentity === false) {
          return await ctx.runQuery(definition.component, args as never)
        }
        return await ctx.runQuery(
          definition.component,
          createBridgeForwardingArgs(
            args as Record<string, unknown>,
            caller,
            (input) => getRequiredBridgeIdentityForwardingKey(options.identityForwardingKey, input),
            'query',
            definition.component,
            functionRef,
          ) as never,
        )
      },
    })
  }

  const registerInternalMutation = <TRef extends ComponentBridgeMutationRef>(
    definition: ComponentBridgeDefinition<TRef>,
  ) => {
    const functionRef = getBridgeFunctionRef(definition.component, definition.functionRef)
    const customization = createInternalBridgeCustomization<DataModel, TCaller>(
      callerDefinition,
      functionRef,
      options.identityForwardingKey,
    )
    const internalMutation = customMutation(builders.internalMutation, customization.mutation)
    return internalMutation({
      args: definition.args,
      returns: definition.returns,
      handler: async (ctx, args: ObjectType<typeof definition.args>) => {
        const caller = await ctx.caller()
        if (definition.forwardIdentity === false) {
          return await ctx.runMutation(definition.component, args as never)
        }
        return await ctx.runMutation(
          definition.component,
          createBridgeForwardingArgs(
            args as Record<string, unknown>,
            caller,
            (input) => getRequiredBridgeIdentityForwardingKey(options.identityForwardingKey, input),
            definition.forwardingPurpose ?? 'mutation',
            definition.component,
            functionRef,
          ) as never,
        )
      },
    })
  }

  const registerInternalAction = <TRef extends ComponentBridgeActionRef>(
    definition: ComponentBridgeDefinition<TRef>,
  ) => {
    if (!builders.internalAction) {
      throw new Error('createComponentBridge() was not configured with an internalAction builder.')
    }
    const functionRef = getBridgeFunctionRef(definition.component, definition.functionRef)
    const customization = createInternalBridgeCustomization<DataModel, TCaller>(
      callerDefinition,
      functionRef,
      options.identityForwardingKey,
    )
    const internalAction = customAction(builders.internalAction, customization.action)
    return internalAction({
      args: definition.args,
      returns: definition.returns,
      handler: async (ctx, args: ObjectType<typeof definition.args>) => {
        const caller = await ctx.caller()
        if (definition.forwardIdentity === false) {
          return await ctx.runAction(definition.component, args as never)
        }
        return await ctx.runAction(
          definition.component,
          createBridgeForwardingArgs(
            args as Record<string, unknown>,
            caller,
            (input) => getRequiredBridgeIdentityForwardingKey(options.identityForwardingKey, input),
            'action',
            definition.component,
            functionRef,
          ) as never,
        )
      },
    })
  }

  return {
    query<TRef extends ComponentBridgeQueryRef>(definition: ComponentBridgeDefinition<TRef>) {
      return registerQuery(definition)
    },

    mutation<TRef extends ComponentBridgeMutationRef>(definition: ComponentBridgeDefinition<TRef>) {
      return registerMutation(definition)
    },

    ...(builders.action
      ? {
          action<TRef extends ComponentBridgeActionRef>(
            definition: ComponentBridgeDefinition<TRef>,
          ) {
            return registerAction(definition)
          },
        }
      : {}),

    internalQuery<TRef extends ComponentBridgeQueryRef>(
      definition: ComponentBridgeDefinition<TRef>,
    ) {
      return registerInternalQuery(definition)
    },

    internalMutation<TRef extends ComponentBridgeMutationRef>(
      definition: ComponentBridgeDefinition<TRef>,
    ) {
      return registerInternalMutation(definition)
    },

    ...(builders.internalAction
      ? {
          internalAction<TRef extends ComponentBridgeActionRef>(
            definition: ComponentBridgeDefinition<TRef>,
          ) {
            return registerInternalAction(definition)
          },
        }
      : {}),

    from<TDefinitions extends BridgeBatchDefinitions>(
      definitions: TDefinitions,
    ): BridgeBatchResult<
      TDefinitions,
      QueryVisibility,
      MutationVisibility,
      InternalQueryVisibility,
      InternalMutationVisibility,
      ActionVisibility,
      InternalActionVisibility
    > {
      const entries = Object.entries(definitions).map(([name, definition]) => {
        switch (definition.operation) {
          case 'query':
            return [name, registerQuery(definition)]
          case 'mutation':
            return [name, registerMutation(definition)]
          case 'action':
            return [name, registerAction(definition)]
          case 'internalQuery':
            return [name, registerInternalQuery(definition)]
          case 'internalMutation':
            return [name, registerInternalMutation(definition)]
          case 'internalAction':
            return [name, registerInternalAction(definition)]
        }
      })

      return Object.fromEntries(entries) as BridgeBatchResult<
        TDefinitions,
        QueryVisibility,
        MutationVisibility,
        InternalQueryVisibility,
        InternalMutationVisibility,
        ActionVisibility,
        InternalActionVisibility
      >
    },
  }
}
