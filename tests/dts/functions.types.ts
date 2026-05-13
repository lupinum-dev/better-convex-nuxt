import { open } from '@lupinum/trellis/auth'
import {
  defineOperation,
  defineOperationMetadata,
  executeOperationRef,
  operationPreview,
  previewOperationRef,
  type InferOperationResult,
  type OperationPreviewEnvelope,
  trellisOperationProjectionMetadataKey,
} from '@lupinum/trellis/backend'
import type { FunctionReference } from 'convex/server'
import { v } from 'convex/values'
import { expectTypeOf } from 'vitest'

const operation = defineOperation.withContext<{
  caller: () => Promise<{ id: string }>
}>()({
  id: 'entries.archive',
  name: 'archiveEntry',
  kind: 'destructive',
  args: {
    id: v.string(),
  },
  guard: open,
  preview: async () =>
    operationPreview({
      summary: 'Archive entry',
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
    OperationPreviewEnvelope<{ operation: string; id: string }>
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
