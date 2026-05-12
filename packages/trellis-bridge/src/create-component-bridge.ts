import {
  definePrincipal,
  type DefaultPrincipal,
  type PrincipalDefinition,
} from '@lupinum/trellis/backend'
import {
  clearTrustedForwardingContext,
  setTrustedForwardingContext,
  withTrustedForwarding,
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
  getRequiredBridgeTrustedForwardingKey,
  type TrustedForwardingKeyInput,
} from './bridge-forwarding.js'
export {
  createBridgeForwardingArgs,
  createBridgeForwardingEnvelope,
  getBridgeTrustedForwardingKeyFromArgs,
  type CreateBridgeForwardingEnvelopeOptions,
  type TrustedForwardingKeyInput,
} from './bridge-forwarding.js'

type AnyCtx<DataModel extends GenericDataModel> =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>
  | GenericActionCtx<DataModel>

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

type ActionCtxWithPrincipal<
  DataModel extends GenericDataModel,
  TPrincipal,
> = GenericActionCtx<DataModel> & BridgeCtxExtension<TPrincipal>

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

function createPublicBridgeCustomization<DataModel extends GenericDataModel, TPrincipal>(
  principalDefinition: PrincipalDefinition<AnyCtx<DataModel>, TPrincipal>,
  expectedFunctionRef: string,
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
  action: Customization<
    GenericActionCtx<DataModel>,
    PropertyValidators,
    ActionCtxWithPrincipal<DataModel, TPrincipal>,
    Record<string, never>
  >
} {
  return {
    query: {
      args: {},
      input: async (ctx, args) => {
        let principalPromise: Promise<TPrincipal> | null = null
        const principal = async () => {
          if (!principalPromise) {
            const ctxWithTrustedForwarding = { ...ctx }
            setTrustedForwardingContext(ctxWithTrustedForwarding, args, {
              expectedPurpose: 'query',
              expectedTransport: 'bridge',
              expectedFunctionRef,
            })
            principalPromise = Promise.resolve(
              principalDefinition.resolve(ctxWithTrustedForwarding, args),
            ).finally(() => {
              clearTrustedForwardingContext(ctxWithTrustedForwarding)
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
      args: {},
      input: async (ctx, args) => {
        let principalPromise: Promise<TPrincipal> | null = null
        const principal = async () => {
          if (!principalPromise) {
            const ctxWithTrustedForwarding = { ...ctx }
            setTrustedForwardingContext(ctxWithTrustedForwarding, args, {
              expectedPurpose: 'mutation',
              expectedTransport: 'bridge',
              expectedFunctionRef,
            })
            principalPromise = Promise.resolve(
              principalDefinition.resolve(ctxWithTrustedForwarding, args),
            ).finally(() => {
              clearTrustedForwardingContext(ctxWithTrustedForwarding)
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
    action: {
      args: {},
      input: async (ctx, args) => {
        let principalPromise: Promise<TPrincipal> | null = null
        const principal = async () => {
          if (!principalPromise) {
            const ctxWithTrustedForwarding = { ...ctx }
            setTrustedForwardingContext(ctxWithTrustedForwarding, args, {
              expectedPurpose: 'action',
              expectedTransport: 'bridge',
              expectedFunctionRef,
            })
            principalPromise = Promise.resolve(
              principalDefinition.resolve(ctxWithTrustedForwarding, args),
            ).finally(() => {
              clearTrustedForwardingContext(ctxWithTrustedForwarding)
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

function createInternalBridgeCustomization<DataModel extends GenericDataModel, TPrincipal>(
  principalDefinition: PrincipalDefinition<AnyCtx<DataModel>, TPrincipal>,
  expectedFunctionRef: string,
  trustedForwardingKeyOverride?: TrustedForwardingKeyInput,
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
  action: Customization<
    GenericActionCtx<DataModel>,
    PropertyValidators,
    ActionCtxWithPrincipal<DataModel, TPrincipal>,
    Record<string, never>
  >
} {
  const forwardingArgs: PropertyValidators = withTrustedForwarding({})

  return {
    query: {
      args: forwardingArgs,
      input: async (ctx, args) => {
        let principalPromise: Promise<TPrincipal> | null = null
        const principal = async () => {
          if (!principalPromise) {
            const ctxWithTrustedForwarding = { ...ctx }
            setTrustedForwardingContext(ctxWithTrustedForwarding, args, {
              expectedKeyOverride: trustedForwardingKeyOverride,
              expectedPurpose: 'query',
              expectedTransport: 'bridge',
              expectedFunctionRef,
            })
            principalPromise = Promise.resolve(
              principalDefinition.resolve(ctxWithTrustedForwarding, args),
            ).finally(() => {
              clearTrustedForwardingContext(ctxWithTrustedForwarding)
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
      args: forwardingArgs,
      input: async (ctx, args) => {
        let principalPromise: Promise<TPrincipal> | null = null
        const principal = async () => {
          if (!principalPromise) {
            const ctxWithTrustedForwarding = { ...ctx }
            setTrustedForwardingContext(ctxWithTrustedForwarding, args, {
              expectedKeyOverride: trustedForwardingKeyOverride,
              expectedPurpose: 'mutation',
              expectedTransport: 'bridge',
              expectedFunctionRef,
            })
            principalPromise = Promise.resolve(
              principalDefinition.resolve(ctxWithTrustedForwarding, args),
            ).finally(() => {
              clearTrustedForwardingContext(ctxWithTrustedForwarding)
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
    action: {
      args: forwardingArgs,
      input: async (ctx, args) => {
        let principalPromise: Promise<TPrincipal> | null = null
        const principal = async () => {
          if (!principalPromise) {
            const ctxWithTrustedForwarding = { ...ctx }
            setTrustedForwardingContext(ctxWithTrustedForwarding, args, {
              expectedKeyOverride: trustedForwardingKeyOverride,
              expectedPurpose: 'action',
              expectedTransport: 'bridge',
              expectedFunctionRef,
            })
            principalPromise = Promise.resolve(
              principalDefinition.resolve(ctxWithTrustedForwarding, args),
            ).finally(() => {
              clearTrustedForwardingContext(ctxWithTrustedForwarding)
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
  ActionVisibility extends FunctionVisibility = FunctionVisibility,
  InternalActionVisibility extends FunctionVisibility = FunctionVisibility,
  TPrincipal = DefaultPrincipal,
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
    principal?: PrincipalDefinition<AnyCtx<DataModel>, TPrincipal>
    trustedForwardingKey?: TrustedForwardingKeyInput
  } = {},
) {
  const principalDefinition =
    options.principal ??
    (definePrincipal.fromAuth<DataModel>() as PrincipalDefinition<AnyCtx<DataModel>, TPrincipal>)

  const registerQuery = <TRef extends ComponentBridgeQueryRef>(
    definition: ComponentBridgeDefinition<TRef>,
  ) => {
    const functionRef = getBridgeFunctionRef(definition.component, definition.functionRef)
    const customization = createPublicBridgeCustomization<DataModel, TPrincipal>(
      principalDefinition,
      functionRef,
    )
    const query = customQuery(builders.query, customization.query)
    return query({
      args: definition.args,
      returns: definition.returns,
      handler: async (ctx, args: ObjectType<typeof definition.args>) => {
        const principal = await ctx.principal()
        return await ctx.runQuery(
          definition.component,
          createBridgeForwardingArgs(
            args as Record<string, unknown>,
            principal,
            (input) => getRequiredBridgeTrustedForwardingKey(options.trustedForwardingKey, input),
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
    const customization = createPublicBridgeCustomization<DataModel, TPrincipal>(
      principalDefinition,
      functionRef,
    )
    const mutation = customMutation(builders.mutation, customization.mutation)
    return mutation({
      args: definition.args,
      returns: definition.returns,
      handler: async (ctx, args: ObjectType<typeof definition.args>) => {
        const principal = await ctx.principal()
        return await ctx.runMutation(
          definition.component,
          createBridgeForwardingArgs(
            args as Record<string, unknown>,
            principal,
            (input) => getRequiredBridgeTrustedForwardingKey(options.trustedForwardingKey, input),
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
    const customization = createPublicBridgeCustomization<DataModel, TPrincipal>(
      principalDefinition,
      functionRef,
    )
    const action = customAction(builders.action, customization.action)
    return action({
      args: definition.args,
      returns: definition.returns,
      handler: async (ctx, args: ObjectType<typeof definition.args>) => {
        const principal = await ctx.principal()
        return await ctx.runAction(
          definition.component,
          createBridgeForwardingArgs(
            args as Record<string, unknown>,
            principal,
            (input) => getRequiredBridgeTrustedForwardingKey(options.trustedForwardingKey, input),
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
    const customization = createInternalBridgeCustomization<DataModel, TPrincipal>(
      principalDefinition,
      functionRef,
      options.trustedForwardingKey,
    )
    const internalQuery = customQuery(builders.internalQuery, customization.query)
    return internalQuery({
      args: definition.args,
      returns: definition.returns,
      handler: async (ctx, args: ObjectType<typeof definition.args>) => {
        const principal = await ctx.principal()
        return await ctx.runQuery(
          definition.component,
          createBridgeForwardingArgs(
            args as Record<string, unknown>,
            principal,
            (input) => getRequiredBridgeTrustedForwardingKey(options.trustedForwardingKey, input),
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
    const customization = createInternalBridgeCustomization<DataModel, TPrincipal>(
      principalDefinition,
      functionRef,
      options.trustedForwardingKey,
    )
    const internalMutation = customMutation(builders.internalMutation, customization.mutation)
    return internalMutation({
      args: definition.args,
      returns: definition.returns,
      handler: async (ctx, args: ObjectType<typeof definition.args>) => {
        const principal = await ctx.principal()
        return await ctx.runMutation(
          definition.component,
          createBridgeForwardingArgs(
            args as Record<string, unknown>,
            principal,
            (input) => getRequiredBridgeTrustedForwardingKey(options.trustedForwardingKey, input),
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
    const customization = createInternalBridgeCustomization<DataModel, TPrincipal>(
      principalDefinition,
      functionRef,
      options.trustedForwardingKey,
    )
    const internalAction = customAction(builders.internalAction, customization.action)
    return internalAction({
      args: definition.args,
      returns: definition.returns,
      handler: async (ctx, args: ObjectType<typeof definition.args>) => {
        const principal = await ctx.principal()
        return await ctx.runAction(
          definition.component,
          createBridgeForwardingArgs(
            args as Record<string, unknown>,
            principal,
            (input) => getRequiredBridgeTrustedForwardingKey(options.trustedForwardingKey, input),
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
