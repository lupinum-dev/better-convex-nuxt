/**
 * MCP Tool: Create Post
 *
 * Uses the shared Convex schema directly so validators and metadata
 * stay aligned with the Convex mutation.
 *
 * Requires authentication — posts.create checks permissions.
 */
import { z } from 'zod'

import { defineConvexSchema } from '../../../../src/runtime/utils/define-convex-schema'
import { serverConvexMutation } from '../../../../src/runtime/server/utils/convex'
import { api } from '../../../convex/_generated/api'
import { createPostArgs, createPostMeta } from '../../../shared/schemas/post'

const schema = defineConvexSchema(createPostArgs, createPostMeta)
const inputSchema = schema.toMcpInput(z)

export default defineMcpTool({
  description: createPostMeta.description,
  inputSchema,
  handler: async (args: any) => {
    const result = await serverConvexMutation(api.posts.create, {
      title: args.title,
      content: args.content,
    })
    return `Post created with ID: ${result}`
  },
})
