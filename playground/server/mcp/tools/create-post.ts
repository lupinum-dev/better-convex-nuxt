/**
 * MCP Tool: Create Post (flagship demo)
 *
 * The "define once, use everywhere" showcase:
 * - createPostArgs + createPostMeta defined in shared/schemas/post.ts
 * - convex/posts.ts uses: mutation({ args: createPostArgs })
 * - This MCP tool uses: defineMcpTool({ inputSchema: await schema.toMcpInput() })
 * - Forms use: <UForm :schema="schema"> (via ~standard)
 * - Server routes use: readValidatedBody(event, schema.validate)
 *
 * Note: Requires authentication — posts.create checks permissions.
 */
import { defineConvexSchema } from '../../../../src/runtime/utils/define-convex-schema'
import { serverConvexMutation } from '../../../../src/runtime/server/utils/convex'
import { api } from '../../../convex/_generated/api'
import { createPostArgs, createPostMeta } from '../../../shared/schemas/post'

const schema = defineConvexSchema(createPostArgs, createPostMeta)
const inputSchema = await schema.toMcpInput()

export default defineMcpTool({
  description: createPostMeta.description,
  inputSchema,
  handler: async (args: any, extra: any) => {
    const result = await serverConvexMutation(extra.event, api.posts.create, {
      title: args.title,
      content: args.content,
    })
    return `Post created with ID: ${result}`
  },
})
