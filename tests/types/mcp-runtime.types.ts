import type { FunctionReference } from 'convex/server'
import { v } from 'convex/values'
import type { H3Event } from 'h3'

import { defineArgs } from '../../src/runtime/args'
import { definePermission, open } from '../../src/runtime/auth'
import {
  defineOperation,
  executeOperationRef,
  operationPreview,
  previewOperationRef,
  type OperationPreviewEnvelope,
} from '../../src/runtime/functions'
import { defineMcpApp, stampMcpToolSafety, type McpConvexCaller } from '../../src/runtime/mcp'

type Assert<T extends true> = T
type IsEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

type Caller = { kind: 'agent'; id: string }
type RecordAccess = { publishEntry: boolean; readEntry: boolean }

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
  { caller: Caller },
  { title: string; count: number }
>

const mutationRef = {} as FunctionReference<
  'mutation',
  'internal',
  { caller: Caller },
  { published: true }
>
const mutationToolSafety = {
  kind: 'bounded-write',
  reason: 'Publishes one entry explicitly named by args.',
} as const
const safeMutationRef = stampMcpToolSafety(mutationRef, mutationToolSafety)

const runtime = defineMcpApp<Caller, RecordAccess>({
  callConvex: async (_event: H3Event, { caller: _principal, actingFor: _delegation }) =>
    ({
      query: async () => ({ title: 'Draft', count: 2 }),
      mutation: async () => ({ published: true }),
      action: async () => ({ executed: true }),
    }) as unknown as McpConvexCaller,
  resolveCaller: async () => ({ kind: 'agent', id: 'run-1' }),
  resolveAccess: async () => ({ publishEntry: true, readEntry: true }),
})

runtime.tool.query({
  schema,
  call: queryRef,
  permission: readEntryPermission,
  mapResult: ({ result }) => {
    type _mappedQuery = Assert<IsEqual<typeof result, { title: string; count: number }>>
    return result.count
  },
})

runtime.tool.query({
  schema,
  call: queryRef,
  permission: readEntryPermission,
  // @ts-expect-error generic MCP previews are unsupported; use tool.operation(...)
  preview: queryRef,
})

runtime.tool.mutation({
  schema,
  call: safeMutationRef,
  permission: publishEntryPermission,
  safety: mutationToolSafety,
  respond: ({ result, ok }) => {
    type _mutationResult = Assert<IsEqual<typeof result, { published: true }>>
    return ok(result)
  },
})

// @ts-expect-error Direct action projection is intentionally unavailable; use tool.operation(...)
const _actionProjectionUnavailable: never = runtime.tool.action

const archiveEntryOp = defineOperation({
  id: 'entries.archive',
  name: 'archiveEntry',
  kind: 'destructive',
  args: {
    id: v.string(),
  },
  guard: open,
  preview: async (): Promise<
    OperationPreviewEnvelope<{
      operation: 'entries.archive'
      targetId: string
      affectedCounts: { entries: number }
    }>
  > =>
    operationPreview({
      summary: 'Archive entry',
      effects: [{ kind: 'entries', summary: 'Entries archived', count: 1 }],
      confirm: {
        operation: 'entries.archive',
        targetId: 'entry_1',
        affectedCounts: { entries: 1 },
      },
    }),
  handler: async () => ({ archived: true as const }),
})

runtime.tool.operation(archiveEntryOp, {
  execute: executeOperationRef(
    archiveEntryOp,
    {} as FunctionReference<
      'mutation',
      'internal',
      { caller: Caller; id: string },
      { archived: true }
    >,
  ),
  preview: previewOperationRef(
    archiveEntryOp,
    {} as FunctionReference<
      'query',
      'internal',
      { caller: Caller; id: string },
      OperationPreviewEnvelope<{
        operation: 'entries.archive'
        targetId: string
        affectedCounts: { entries: number }
      }>
    >,
  ),
  permission: publishEntryPermission,
})
