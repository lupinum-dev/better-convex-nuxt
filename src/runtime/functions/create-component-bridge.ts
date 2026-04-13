import { customMutation, customQuery, type Customization } from 'convex-helpers/server/customFunctions'
import type {
  FunctionVisibility,
  FunctionReference,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
  MutationBuilder,
  QueryBuilder,
} from 'convex/server'
import type { GenericValidator, ObjectType, PropertyValidators } from 'convex/values'
import { v } from 'convex/values'

import { definePrincipal, type DefaultPrincipal, type PrincipalDefinition } from './define-principal.js'

type AnyCtx<DataModel extends GenericDataModel> =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>

type PrincipalAccessor<TPrincipal> = () => Promise<TPrincipal>

type BridgeCtxExtension<TPrincipal> = {
  principal: PrincipalAccessor<TPrincipal>
}

type QueryCtxWithPrincipal<DataModel extends GenericDataModel, TPrincipal> = GenericQueryCtx<DataModel> &
  BridgeCtxExtension<TPrincipal>

type MutationCtxWithPrincipal<DataModel extends GenericDataModel, TPrincipal> =
  GenericMutationCtx<DataModel> & BridgeCtxExtension<TPrincipal>

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
          principalPromise ??= Promise.resolve(principalDefinition.resolve(ctx, args))
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
          principalPromise ??= Promise.resolve(principalDefinition.resolve(ctx, args))
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
    options.principal ?? definePrincipal.fromAuth<DataModel>() as PrincipalDefinition<AnyCtx<DataModel>, TPrincipal>
  const customization = createBridgeCustomization<DataModel, TPrincipal>(principalDefinition)

  const query = customQuery(builders.query, customization.query)
  const mutation = customMutation(builders.mutation, customization.mutation)
  const internalQuery = customQuery(builders.internalQuery, customization.query)
  const internalMutation = customMutation(builders.internalMutation, customization.mutation)

  return {
    query<TRef extends QueryRef>(definition: BridgeDefinition<TRef>) {
      return query({
        args: definition.args,
        returns: definition.returns,
        handler: async (ctx, args: ObjectType<typeof definition.args>) =>
          await ctx.runQuery(definition.component, {
            ...args,
            principal: await ctx.principal(),
          } as never),
      })
    },

    mutation<TRef extends MutationRef>(definition: BridgeDefinition<TRef>) {
      return mutation({
        args: definition.args,
        returns: definition.returns,
        handler: async (ctx, args: ObjectType<typeof definition.args>) =>
          await ctx.runMutation(definition.component, {
            ...args,
            principal: await ctx.principal(),
          } as never),
      })
    },

    internalQuery<TRef extends QueryRef>(definition: BridgeDefinition<TRef>) {
      return internalQuery({
        args: definition.args,
        returns: definition.returns,
        handler: async (ctx, args: ObjectType<typeof definition.args>) =>
          await ctx.runQuery(definition.component, {
            ...args,
            principal: await ctx.principal(),
          } as never),
      })
    },

    internalMutation<TRef extends MutationRef>(definition: BridgeDefinition<TRef>) {
      return internalMutation({
        args: definition.args,
        returns: definition.returns,
        handler: async (ctx, args: ObjectType<typeof definition.args>) =>
          await ctx.runMutation(definition.component, {
            ...args,
            principal: await ctx.principal(),
          } as never),
      })
    },
  }
}
