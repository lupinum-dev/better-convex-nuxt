import { open } from '@lupinum/trellis/auth'
import {
  defineOperation,
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
