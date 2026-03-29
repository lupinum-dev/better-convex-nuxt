import { defineConvexTool } from 'better-convex-nuxt/mcp'
import { defineConvexSchema } from 'better-convex-nuxt/schema'

import { api } from '../../../convex/_generated/api'

const schema = defineConvexSchema({}, { description: 'List all notes (most recent first)' })

export default defineConvexTool({
  schema,
  name: 'list-notes',
  operation: 'query',
  handler: async (_args, _extra, ctx) => {
    return await ctx.query(api.notes.list)
  },
})
