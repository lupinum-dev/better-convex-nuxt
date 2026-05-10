import { defineArgs } from '@lupinum/trellis/args'
import { definePermission, definePermissionContext, open } from '@lupinum/trellis/auth'
import { defineOperation, executeOperationRef, previewOperationRef } from '@lupinum/trellis/backend'
import type {
  InferOperationResult,
  InferPermissionContext,
  SerializableValue,
  ValidateSerializable,
  ValidateMcpToolOptions,
  ValidateOperationId,
  ValidatePermissionKey,
  ValidateToolArgs,
} from '@lupinum/trellis/type-primitives'
import type { FunctionReference } from 'convex/server'
import { v } from 'convex/values'
import { expectTypeOf } from 'vitest'

const permission = definePermission({
  key: 'task.read',
  check: true,
})

const _permissionContext = definePermissionContext({
  permissions: [permission] as const,
  resolve: async () => ({
    userId: 'user_1',
    tenantId: 'workspace_1',
    role: 'owner' as const,
  }),
  extend: () => ({
    displayName: 'Matthias',
  }),
})

type PermissionContext = InferPermissionContext<typeof _permissionContext>

expectTypeOf<ValidatePermissionKey<PermissionContext, 'task.read'>>().toEqualTypeOf<'task.read'>()

const operation = defineOperation({
  id: 'entries.archive',
  kind: 'destructive',
  args: {
    id: v.string(),
  },
  guard: open,
  preview: async () => ({
    display: { summary: 'Archive entry' },
    confirm: { id: 'entry_1' },
  }),
  handler: async () => ({ archived: true as const }),
})

expectTypeOf<
  ValidateOperationId<typeof operation, 'entries.archive'>
>().toEqualTypeOf<'entries.archive'>()
expectTypeOf<InferOperationResult<typeof operation>>().toEqualTypeOf<{
  archived: true
}>()

const _schema = defineArgs({
  args: {
    id: v.string(),
  },
})

expectTypeOf<ValidateToolArgs<typeof _schema, { id: string }>>().toEqualTypeOf<{
  id: string
}>()
expectTypeOf<
  ValidateSerializable<{
    archived: true
    summary: string | null
    relatedIds: string[]
  }>
>().toEqualTypeOf<{
  archived: true
  summary: string | null
  relatedIds: string[]
}>()
expectTypeOf<SerializableValue>().toMatchTypeOf<
  | string
  | number
  | boolean
  | null
  | readonly SerializableValue[]
  | { [key: string]: SerializableValue }
>()

const _invalidSerializable: ValidateSerializable<{ run: () => void }> = {
  // @ts-expect-error functions are not transport-serializable
  run: () => {},
}

type _toolOptions = ValidateMcpToolOptions<
  typeof _schema,
  { kind: 'agent'; id: string },
  never,
  { publishEntry: boolean },
  Record<string, never>,
  {
    schema: typeof _schema
    call: FunctionReference<'mutation', 'internal', { id: string }, { archived: true }>
  }
>

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
      confirm: { id: string }
    }
  >,
)

void executeRef
void previewRef
void ({} as _toolOptions)
