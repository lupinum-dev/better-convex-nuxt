import { defineArgs } from '@lupinum/trellis/args'
import { definePermission, open } from '@lupinum/trellis/auth'
import {
  defineOperation,
  executeOperationRef,
  previewOperationRef,
} from '@lupinum/trellis/functions'
import {
  defineMcpApp,
  type McpConvexCaller,
  type ValidateMcpToolOptions,
  type ValidateToolArgs,
} from '@lupinum/trellis/mcp'
import type { FunctionReference } from 'convex/server'
import { v } from 'convex/values'
import type { H3Event } from 'h3'
import { expectTypeOf } from 'vitest'

type Principal = { kind: 'agent'; id: string }
type Capabilities = { publishEntry: boolean }

const _schema = defineArgs({
  args: {
    id: v.string(),
  },
})

expectTypeOf<ValidateToolArgs<typeof _schema, { id: string }>>().toEqualTypeOf<{ id: string }>()

const publishPermission = definePermission({
  key: 'publishEntry',
  check: true,
})

const runtime = defineMcpApp<Principal, Capabilities>({
  callConvex: async (_event: H3Event) =>
    ({
      query: async () => ({ ok: true }),
      mutation: async () => ({ archived: true as const }),
      action: async () => ({ ok: true }),
    }) as unknown as McpConvexCaller,
  resolvePrincipal: async () => ({ kind: 'agent', id: 'run-1' }),
  resolveCapabilities: async () => ({ publishEntry: true }),
})

type _toolOptions = ValidateMcpToolOptions<
  typeof _schema,
  Principal,
  never,
  Capabilities,
  Record<string, never>,
  {
    schema: typeof _schema
    call: FunctionReference<'mutation', 'internal', { id: string }, { archived: true }>
  }
>

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

runtime.tool.fromOperation(operation, {
  execute: executeRef,
  preview: previewRef,
  permission: publishPermission,
})

runtime.tool.fromOperation(operation, {
  // @ts-expect-error execute must be an execute projection ref for this operation
  execute: previewRef,
  // @ts-expect-error preview must be a preview projection ref for this operation
  preview: executeRef,
  permission: publishPermission,
})

void ({} as _toolOptions)
