import type { FunctionReference } from 'convex/server'
import { v } from 'convex/values'
import type { H3Event } from 'h3'

import { defineArgs } from '../../src/runtime/args'
import { definePermission, open } from '../../src/runtime/auth'
import {
  defineOperation,
  trellisOperationProjectionMetadataKey,
  type DestructiveOperationPreview,
} from '../../src/runtime/functions'
import { defineMcpApp, type McpConvexCaller } from '../../src/runtime/mcp'

type Assert<T extends true> = T
type IsEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

type Principal = { kind: 'agent'; id: string }
type Capabilities = { publishEntry: boolean; readEntry: boolean }

const readEntryPermission = definePermission({
  key: 'readEntry',
  check: true,
})

const publishEntryPermission = definePermission({
  key: 'publishEntry',
  check: true,
})

const schema = defineArgs({
  args: {},
})

const queryRef = {} as FunctionReference<
  'query',
  'internal',
  { principal: Principal },
  { title: string; count: number }
>

const mutationRef = {} as FunctionReference<
  'mutation',
  'internal',
  { principal: Principal },
  { published: true }
>

const actionRef = {} as FunctionReference<
  'action',
  'internal',
  { principal: Principal },
  { executed: true }
>

const runtime = defineMcpApp<Principal, Capabilities>({
  callConvex: async (_event: H3Event, _principal: Principal) =>
    ({
      query: async () => ({ title: 'Draft', count: 2 }),
      mutation: async () => ({ published: true }),
      action: async () => ({ executed: true }),
    }) as unknown as McpConvexCaller,
  resolvePrincipal: async () => ({ kind: 'agent', id: 'run-1' }),
  resolveCapabilities: async () => ({ publishEntry: true, readEntry: true }),
})

runtime.tool({
  schema,
  call: queryRef,
  operation: 'query',
  permission: readEntryPermission,
  preview: queryRef,
  previewResult: ({ result }) => {
    type _previewResult = Assert<IsEqual<typeof result, { title: string; count: number }>>
    return result.title
  },
  mapResult: ({ result }) => {
    type _mappedQuery = Assert<IsEqual<typeof result, { title: string; count: number }>>
    return result.count
  },
})

runtime.tool({
  schema,
  call: mutationRef,
  permission: publishEntryPermission,
  respond: ({ result, ok }) => {
    type _mutationResult = Assert<IsEqual<typeof result, { published: true }>>
    return ok(result)
  },
})

runtime.tool({
  schema,
  call: actionRef,
  operation: 'action',
  respond: ({ result, ok }) => {
    type _actionResult = Assert<IsEqual<typeof result, { executed: true }>>
    return ok(result)
  },
})

const archiveEntryOp = defineOperation({
  id: 'entries.archive',
  name: 'archiveEntry',
  kind: 'destructive',
  args: {
    id: v.string(),
  },
  guard: open,
  preview: async (): Promise<
    DestructiveOperationPreview<
      { summary: string; affects: { entries: number } },
      { operation: 'entries.archive'; targetId: string; affectedCounts: { entries: number } }
    >
  > => ({
    display: { summary: 'Archive entry', affects: { entries: 1 } },
    confirm: {
      operation: 'entries.archive',
      targetId: 'entry_1',
      affectedCounts: { entries: 1 },
    },
  }),
  handler: async () => ({ archived: true as const }),
})

runtime.tool.fromOperation(archiveEntryOp, {
  execute: {
    [trellisOperationProjectionMetadataKey]: {
      operationId: 'entries.archive',
      projection: 'execute',
    },
  } as unknown as FunctionReference<
    'mutation',
    'internal',
    { principal: Principal; id: string },
    { archived: true }
  >,
  preview: {
    [trellisOperationProjectionMetadataKey]: {
      operationId: 'entries.archive',
      projection: 'preview',
    },
  } as unknown as FunctionReference<
    'query',
    'internal',
    { principal: Principal; id: string },
    DestructiveOperationPreview<
      { summary: string; affects: { entries: number } },
      { operation: 'entries.archive'; targetId: string; affectedCounts: { entries: number } }
    >
  >,
  permission: publishEntryPermission,
})
