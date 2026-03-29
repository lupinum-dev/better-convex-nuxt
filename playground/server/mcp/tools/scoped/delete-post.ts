/**
 * MCP Tool: Delete Post (Scoped — full safety stack)
 *
 * Demonstrates all safety features with tenant scoping:
 * scoped + auth + permission + destructive + preview.
 */
import { defineConvexSchema } from 'better-convex-nuxt/schema'
import { serverConvexMutation, serverConvexQuery } from 'better-convex-nuxt/server'
import { v } from 'convex/values'

import { api } from '../../../../convex/_generated/api'
import { defineConvexTool } from '../../utils/tools'

const schema = defineConvexSchema(
  { id: v.id('posts') },
  {
    description: 'Permanently delete a post from the current organization',
    fields: {
      id: { description: 'The ID of the post to delete' },
    },
  },
)

export default defineConvexTool({
  schema,
  name: 'scoped-delete-post',
  auth: 'required',
  require: 'post.delete',
  scoped: true,
  destructive: true,
  preview: async (args, ctx) => {
    const post = await serverConvexQuery(api.posts.get, { id: args.id })
    if (!post) {
      return { summary: 'Post not found', blocked: true }
    }
    // MCP-layer org check via ctx.can
    return {
      summary: `Will permanently delete "${post.title}" from org`,
      warn: 'This cannot be undone',
      affects: { posts: 1 },
    }
  },
  handler: async (args, _extra, ctx) => {
    await serverConvexMutation(api.posts.remove, args)
    return { deleted: true, id: args.id, orgId: ctx?.org.id }
  },
})
