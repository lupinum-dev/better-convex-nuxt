import { defineConvexSchema } from 'better-convex-nuxt/schema'
import { v } from 'convex/values'

import { api } from '../../../convex/_generated/api'
import { defineConvexTool } from '../utils/tools'

const schema = defineConvexSchema(
  { id: v.id('posts') },
  {
    description: 'Permanently delete a post and all its data',
    fields: {
      id: { description: 'The ID of the post to delete' },
    },
  },
)

export default defineConvexTool({
  schema,
  name: 'delete-post',
  auth: 'required',
  require: 'post.delete',
  scoped: true,
  destructive: true,
  preview: async (args, ctx) => {
    const post = await ctx.query(api.posts.get, { id: args.id })
    if (!post) return { summary: 'Post not found', blocked: true }
    return {
      summary: `Will permanently delete "${post.title}"`,
      warn: 'This cannot be undone',
      affects: { posts: 1 },
    }
  },
  handler: async (args, _extra, ctx) => {
    await ctx.mutation(api.posts.remove, args)
    return { deleted: true, id: args.id }
  },
})
