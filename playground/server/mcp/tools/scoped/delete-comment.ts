/**
 * MCP Tool: Delete Comment (Scoped — destructive)
 */
import { defineConvexSchema } from 'better-convex-nuxt/schema'
import { serverConvexMutation } from 'better-convex-nuxt/server'

import { api } from '../../../../convex/_generated/api'
import { deleteCommentArgs, deleteCommentMeta } from '../../../../shared/schemas/comment'
import { defineConvexTool } from '../../utils/tools'

const schema = defineConvexSchema(deleteCommentArgs, deleteCommentMeta)

export default defineConvexTool({
  schema,
  name: 'scoped-delete-comment',
  auth: 'required',
  require: 'comment.delete',
  scoped: true,
  destructive: true,
  handler: async (args, _extra, ctx) => {
    await serverConvexMutation(api.posts.remove, { id: args.id as any })
    return { deleted: true, id: args.id, orgId: ctx?.org.id }
  },
})
