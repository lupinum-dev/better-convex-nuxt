import { defineArgs } from 'better-convex-nuxt/args'

import { defineTool } from '#convex/mcp'

import { api } from '../../../convex/_generated/api'

const schema = defineArgs({
  description: 'List all notes (most recent first)',
  args: {},
})

export default defineTool({
  schema,
  name: 'list-notes',
  operation: 'query',
  handler: async (_args, ctx) => {
    return await ctx.query(api.notes.list)
  },
})
