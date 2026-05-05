import { open } from '@lupinum/trellis/auth'
import {
  callComponentBridgeRegistrar,
  type ComponentBridgeMutationRegistrar,
  type ComponentBridgeQueryRegistrar,
  defineOperation,
  defineOperationMetadata,
  executeOperationRef,
  previewOperationRef,
  type InferOperationResult,
  trellisOperationProjectionMetadataKey,
} from '@lupinum/trellis/functions'
import type { FunctionReference } from 'convex/server'
import { v } from 'convex/values'
import { expectTypeOf } from 'vitest'

const operation = defineOperation.withContext<{
  principal: () => Promise<{ id: string }>
}>()({
  id: 'entries.archive',
  name: 'archiveEntry',
  kind: 'destructive',
  args: {
    id: v.string(),
  },
  guard: open,
  preview: async () => ({
    display: { summary: 'Archive entry' },
    confirm: { operation: 'entries.archive', id: 'entry_1' },
  }),
  handler: async () => ({ archived: true as const }),
})

expectTypeOf<InferOperationResult<typeof operation>>().toEqualTypeOf<{
  archived: true
}>()

const executeRef = executeOperationRef(
  operation,
  {} as FunctionReference<'mutation', 'internal', { id: string }, { archived: true }>,
)
const previewRef = previewOperationRef(
  operation,
  {} as FunctionReference<
    'query',
    'internal',
    { id: string },
    {
      display: { summary: string }
      confirm: { operation: string; id: string }
    }
  >,
)

expectTypeOf(
  executeRef[trellisOperationProjectionMetadataKey].operationId,
).toEqualTypeOf<'entries.archive'>()
expectTypeOf(
  previewRef[trellisOperationProjectionMetadataKey].projection,
).toEqualTypeOf<'preview'>()

const metadataOnlyOperation = defineOperationMetadata({
  id: 'entries.archive-metadata',
  name: 'archiveEntry',
  kind: 'destructive',
  args: { id: v.string() },
})
const metadataOnlyExecuteRef = executeOperationRef(
  metadataOnlyOperation,
  {} as FunctionReference<'mutation', 'internal', { id: string }, { archived: true }>,
)
expectTypeOf(
  metadataOnlyExecuteRef[trellisOperationProjectionMetadataKey].operationId,
).toEqualTypeOf<'entries.archive-metadata'>()

const componentRef = {} as FunctionReference<'query', 'public', { slug: string }, { ok: true }>
const componentMutationRef = {} as FunctionReference<
  'mutation',
  'public',
  { id: string },
  { ok: true }
>
const componentBridgeQueryRegistrar = ((definition: never) =>
  definition) as unknown as ComponentBridgeQueryRegistrar<'public'>
const componentBridgeMutationRegistrar = ((definition: never) =>
  definition) as unknown as ComponentBridgeMutationRegistrar<'public'>
expectTypeOf(
  callComponentBridgeRegistrar(componentBridgeQueryRegistrar, {
    component: componentRef,
    args: { slug: v.string() },
  }),
).toEqualTypeOf<
  import('convex/server').RegisteredQuery<'public', { slug: string }, Promise<{ ok: true }>>
>()
expectTypeOf(
  callComponentBridgeRegistrar(componentBridgeMutationRegistrar, {
    component: componentMutationRef,
    args: { id: v.string() },
  }),
).toEqualTypeOf<
  import('convex/server').RegisteredMutation<'public', { id: string }, Promise<{ ok: true }>>
>()

// @ts-expect-error query registrar must reject mutation refs
callComponentBridgeRegistrar(componentBridgeQueryRegistrar, {
  component: componentMutationRef,
  args: { id: v.string() },
})

// @ts-expect-error mutation registrar must reject query refs
callComponentBridgeRegistrar(componentBridgeMutationRegistrar, {
  component: componentRef,
  args: { slug: v.string() },
})
