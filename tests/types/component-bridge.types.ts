import { createComponentBridge } from '@lupinum/trellis-bridge/component'
import { defineCaller } from '@lupinum/trellis/backend'
import type {
  ActionBuilder,
  FunctionReference,
  GenericDataModel,
  MutationBuilder,
  QueryBuilder,
  RegisteredAction,
  RegisteredMutation,
  RegisteredQuery,
} from 'convex/server'
import { v } from 'convex/values'

type Assert<T extends true> = T
type IsEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

type DataModel = GenericDataModel
type Caller = { kind: 'service'; service: string }

const builders = {
  query: (() => null as never) as QueryBuilder<DataModel, 'public'>,
  mutation: (() => null as never) as MutationBuilder<DataModel, 'public'>,
  action: (() => null as never) as ActionBuilder<DataModel, 'public'>,
  internalQuery: (() => null as never) as QueryBuilder<DataModel, 'internal'>,
  internalMutation: (() => null as never) as MutationBuilder<DataModel, 'internal'>,
  internalAction: (() => null as never) as ActionBuilder<DataModel, 'internal'>,
}

const caller = defineCaller({
  validator: v.object({ kind: v.literal('service'), service: v.string() }),
  resolve: async (): Promise<Caller> => ({ kind: 'service', service: 'mcp' }),
})

const bridge = createComponentBridge<
  DataModel,
  'public',
  'public',
  'internal',
  'internal',
  'public',
  'internal',
  Caller
>(builders, { caller })

const queryRef = {} as FunctionReference<
  'query',
  'internal',
  { slug: string; caller: Caller },
  { ok: true }
>

const publicQueryRef = {} as FunctionReference<
  'query',
  'public',
  { slug: string; caller: Caller },
  { slug: string }
>

const mutationRef = {} as FunctionReference<
  'mutation',
  'internal',
  { id: string; caller: Caller },
  { ok: true }
>

const publicMutationRef = {} as FunctionReference<
  'mutation',
  'public',
  { id: string; caller: Caller },
  { id: string }
>

const actionRef = {} as FunctionReference<
  'action',
  'internal',
  { id: string; caller: Caller },
  { ok: true }
>

const publicActionRef = {} as FunctionReference<
  'action',
  'public',
  { id: string; caller: Caller },
  { id: string }
>

const _runtimePublicQuery = bridge.query({
  component: publicQueryRef,
  args: { slug: v.string() },
})

const _runtimeInternalQuery = bridge.internalQuery({
  component: queryRef,
  args: { slug: v.string() },
})

const _runtimePublicMutation = bridge.mutation({
  component: publicMutationRef,
  args: { id: v.string() },
})

const _runtimeInternalMutation = bridge.internalMutation({
  component: mutationRef,
  args: { id: v.string() },
})

const _runtimePublicAction = bridge.action!({
  component: publicActionRef,
  args: { id: v.string() },
})

const _runtimeInternalAction = bridge.internalAction!({
  component: actionRef,
  args: { id: v.string() },
})

const _runtimeBatchBridge = bridge.from({
  publicList: {
    operation: 'query',
    component: publicQueryRef,
    args: { slug: v.string() },
  },
  internalPublish: {
    operation: 'internalMutation',
    component: mutationRef,
    args: { id: v.string() },
  },
  internalAsyncPublish: {
    operation: 'internalAction',
    component: actionRef,
    args: { id: v.string() },
  },
})

type _publicQuery = Assert<
  IsEqual<
    typeof _runtimePublicQuery,
    RegisteredQuery<'public', { slug: string }, Promise<{ slug: string }>>
  >
>
type _internalQuery = Assert<
  IsEqual<
    typeof _runtimeInternalQuery,
    RegisteredQuery<'internal', { slug: string }, Promise<{ ok: true }>>
  >
>
type _publicMutation = Assert<
  IsEqual<
    typeof _runtimePublicMutation,
    RegisteredMutation<'public', { id: string }, Promise<{ id: string }>>
  >
>
type _internalMutation = Assert<
  IsEqual<
    typeof _runtimeInternalMutation,
    RegisteredMutation<'internal', { id: string }, Promise<{ ok: true }>>
  >
>
type _publicAction = Assert<
  IsEqual<
    typeof _runtimePublicAction,
    RegisteredAction<'public', { id: string }, Promise<{ id: string }>>
  >
>
type _internalAction = Assert<
  IsEqual<
    typeof _runtimeInternalAction,
    RegisteredAction<'internal', { id: string }, Promise<{ ok: true }>>
  >
>
type _batchPublicQuery = Assert<
  IsEqual<
    typeof _runtimeBatchBridge.publicList,
    RegisteredQuery<'public', { slug: string }, Promise<{ slug: string }>>
  >
>
type _batchInternalMutation = Assert<
  IsEqual<
    typeof _runtimeBatchBridge.internalPublish,
    RegisteredMutation<'internal', { id: string }, Promise<{ ok: true }>>
  >
>
type _batchInternalAction = Assert<
  IsEqual<
    typeof _runtimeBatchBridge.internalAsyncPublish,
    RegisteredAction<'internal', { id: string }, Promise<{ ok: true }>>
  >
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

bridge.from({
  // @ts-expect-error query batch bridge must reject mutation refs
  invalidQuery: {
    operation: 'query',
    component: mutationRef,
    args: { id: v.string() },
  },
})

bridge.from({
  // @ts-expect-error mutation batch bridge must reject query refs
  invalidMutation: {
    operation: 'internalMutation',
    component: queryRef,
    args: { slug: v.string() },
  },
})
