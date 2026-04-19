import { defineArgs } from '@lupinum/trellis/args'

import { defineTool } from '#trellis/mcp'

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
