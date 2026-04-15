import { defineTool } from '#trellis/mcp'

import { api } from '../../../convex/_generated/api'
import { searchNotes } from '../../../shared/schemas/note'

export default defineTool({
  schema: searchNotes,
  name: 'search-notes',
  operation: 'query',
  auth: 'optional',
  inputExamples: [{ query: 'meeting' }, { query: 'TODO' }, { query: 'project update' }],
  handler: async (args, ctx) => {
    const results = await ctx.rawQuery(api.notes.search, { query: args.query })

    return ctx.ok(
      { results, total: results.length },
      results.length
        ? `Found ${results.length} note${results.length === 1 ? '' : 's'} matching "${args.query}"`
        : `No notes found matching "${args.query}"`,
    )
  },
})
