import type {
  FunctionReference,
  GenericDataModel,
  MutationBuilder,
  QueryBuilder,
  RegisteredMutation,
  RegisteredQuery,
} from 'convex/server'
import { v } from 'convex/values'

import { createComponentBridge, definePrincipal } from '../../src/runtime/functions'

type Assert<T extends true> = T
type IsEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

type DataModel = GenericDataModel
type Principal = { kind: 'service'; service: string }

const builders = {
  query: (() => null as never) as QueryBuilder<DataModel, 'public'>,
  mutation: (() => null as never) as MutationBuilder<DataModel, 'public'>,
  internalQuery: (() => null as never) as QueryBuilder<DataModel, 'internal'>,
  internalMutation: (() => null as never) as MutationBuilder<DataModel, 'internal'>,
}

const principal = definePrincipal({
  validator: v.object({ kind: v.literal('service'), service: v.string() }),
  resolve: async (): Promise<Principal> => ({ kind: 'service', service: 'mcp' }),
})

const bridge = createComponentBridge(builders, { principal })

const queryRef = {} as FunctionReference<
  'query',
  'internal',
  { slug: string; principal: Principal },
  { ok: true }
>

const publicQueryRef = {} as FunctionReference<
  'query',
  'public',
  { slug: string; principal: Principal },
  { slug: string }
>

const mutationRef = {} as FunctionReference<
  'mutation',
  'internal',
  { id: string; principal: Principal },
  { ok: true }
>

const publicMutationRef = {} as FunctionReference<
  'mutation',
  'public',
  { id: string; principal: Principal },
  { id: string }
>

const publicQuery = bridge.query({
  component: publicQueryRef,
  args: { slug: v.string() },
})

const internalQuery = bridge.internalQuery({
  component: queryRef,
  args: { slug: v.string() },
})

const publicMutation = bridge.mutation({
  component: publicMutationRef,
  args: { id: v.string() },
})

const internalMutation = bridge.internalMutation({
  component: mutationRef,
  args: { id: v.string() },
})

type _publicQuery = Assert<
  IsEqual<typeof publicQuery, RegisteredQuery<'public', { slug: string }, Promise<{ slug: string }>>>
>
type _internalQuery = Assert<
  IsEqual<typeof internalQuery, RegisteredQuery<'internal', { slug: string }, Promise<{ ok: true }>>>
>
type _publicMutation = Assert<
  IsEqual<typeof publicMutation, RegisteredMutation<'public', { id: string }, Promise<{ id: string }>>>
>
type _internalMutation = Assert<
  IsEqual<typeof internalMutation, RegisteredMutation<'internal', { id: string }, Promise<{ ok: true }>>>
>

bridge.query({
  // @ts-expect-error query bridge must reject mutation refs
  component: mutationRef,
  args: { id: v.string() },
})

bridge.internalMutation({
  // @ts-expect-error mutation bridge must reject query refs
  component: queryRef,
  args: { slug: v.string() },
})
