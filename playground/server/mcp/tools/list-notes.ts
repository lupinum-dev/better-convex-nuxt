import { defineTool } from '#convex/mcp'
import { defineSchema } from 'better-convex-nuxt/schema'

import { api } from '../../../convex/_generated/api'

const schema = defineSchema({
  description: 'List all notes (most recent first)',
  args: {},
})

export default defineTool({
  schema,
  name: 'list-notes',
  operation: 'query',
  handler: async (_args, _extra, ctx) => {
    return await ctx.query(api.notes.list)
  },
})
