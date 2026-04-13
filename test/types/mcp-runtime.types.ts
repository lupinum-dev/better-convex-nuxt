import type { FunctionReference } from 'convex/server'
import type { H3Event } from 'h3'

import { defineArgs } from '../../src/runtime/args'
import { defineMcpRuntime } from '../../src/runtime/mcp'

type Assert<T extends true> = T
type IsEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

type Principal = { kind: 'agent'; id: string }
type Capabilities = { publishEntry: boolean; readEntry: boolean }

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

const runtime = defineMcpRuntime<Principal, Capabilities>({
  callConvex: async (_event: H3Event) => ({
    query: async () => ({ title: 'Draft', count: 2 }),
    mutation: async () => ({ published: true }),
    action: async () => ({ executed: true }),
  }),
  resolvePrincipal: async () => ({ kind: 'agent', id: 'run-1' }),
  resolveCapabilities: async () => ({ publishEntry: true, readEntry: true }),
})

runtime.projectTool({
  schema,
  call: queryRef,
  operation: 'query',
  capability: 'readEntry',
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

runtime.projectTool({
  schema,
  call: mutationRef,
  capability: 'publishEntry',
  respond: ({ result, ok }) => {
    type _mutationResult = Assert<IsEqual<typeof result, { published: true }>>
    return ok(result)
  },
})

runtime.projectTool({
  schema,
  call: actionRef,
  operation: 'action',
  respond: ({ result, ok }) => {
    type _actionResult = Assert<IsEqual<typeof result, { executed: true }>>
    return ok(result)
  },
})

