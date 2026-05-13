import { stampMcpToolSafety } from '#trellis/mcp'

import { api } from '../../../convex/_generated/api'
import { createComment } from '../../../shared/schemas/comment'
import { resolveHarnessMcpAuth } from '../../support/mcp-auth-helpers'
import { tool } from '../runtime'

const harnessApi = api as any

const createCommentSafety = {
  kind: 'bounded-write',
  reason: 'Creates one comment for one explicitly named post.',
} as const

export default tool.mutation({
  schema: createComment,
  call: stampMcpToolSafety(harnessApi.comments.create, createCommentSafety),
  safety: createCommentSafety,
  enabled: async (ctx) => {
    const auth = await resolveHarnessMcpAuth(ctx.event)
    return !!auth?.workspaceId
  },
  meta: {
    name: 'create-comment',
  },
  respond: ({ args, result, ok }) =>
    ok({ id: result, postId: args.postId }, `Added comment to post ${args.postId}`),
})
