import { stampMcpToolSafety } from '#trellis/mcp'

import { api } from '../../../convex/_generated/api'
import { createPost } from '../../../shared/schemas/post'
import { resolveHarnessMcpAuth } from '../../support/mcp-auth-helpers'
import { tool } from '../runtime'

const harnessApi = api as any

const createPostSafety = {
  kind: 'bounded-write',
  reason: 'Creates one draft post explicitly named by args.',
} as const

export default tool.mutation({
  schema: createPost,
  call: stampMcpToolSafety(harnessApi.posts.create, createPostSafety),
  safety: createPostSafety,
  enabled: async (ctx) => {
    const auth = await resolveHarnessMcpAuth(ctx.event)
    return !!auth?.workspaceId && ['owner', 'admin', 'member'].includes(auth.role)
  },
  meta: {
    name: 'create-post',
  },
  respond: ({ args, result, ok }) => ok({ id: result }, `Created post "${args.title}"`),
})
