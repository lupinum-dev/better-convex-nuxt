import type { McpToolExtra } from '@nuxtjs/mcp-toolkit/server'
import { makeFunctionReference } from 'convex/server'
import { v } from 'convex/values'

import { useConvexAction } from '../../src/runtime/composables/useConvexAction'
import { useConvexMutation } from '../../src/runtime/composables/useConvexMutation'
import { createConvexTools, defineConvexTool } from '../../src/runtime/mcp/define-convex-tool'
import { defineConvexSchema } from '../../src/runtime/utils/define-convex-schema'

const schema = defineConvexSchema({
  title: v.string(),
  count: v.optional(v.float64()),
})

const tool = defineConvexTool({
  schema,
  inputExamples: [{ title: 'Hello' }],
  handler: (args, extra) => {
    const title: string = args.title
    const count: number | undefined = args.count
    const typedExtra: McpToolExtra = extra

    void title
    void count
    void typedExtra

    return { ok: true }
  },
})

void tool

const { defineConvexTool: defineRestrictedTool } = createConvexTools<'post.create' | 'post.delete'>({
  checkPermission: () => true,
})

defineRestrictedTool({
  schema,
  require: 'post.create',
  auth: 'required',
  handler: () => ({ ok: true }),
})

defineRestrictedTool({
  schema,
  auth: 'required',
  // @ts-expect-error Invalid permission should be rejected.
  require: 'post.update',
  handler: () => ({ ok: true }),
})

const mutation = makeFunctionReference<'mutation', { title: string }, { id: string }>('posts:create')
const mutationCall = useConvexMutation(mutation)
void mutationCall({ title: 'Hello' })
void mutationCall.data.value?.id

// @ts-expect-error Mutation args should stay inferred from the function reference.
void mutationCall({ title: 42 })

const action = makeFunctionReference<'action', { url: string }, { ok: boolean }>('external:fetch')
const actionCall = useConvexAction(action)
void actionCall({ url: 'https://example.com' })
void actionCall.data.value?.ok

// @ts-expect-error Action args should stay inferred from the function reference.
void actionCall({ retry: true })
