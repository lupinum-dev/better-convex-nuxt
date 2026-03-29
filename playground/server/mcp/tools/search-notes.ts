import { defineConvexTool, withSummary } from 'better-convex-nuxt/mcp'
import { defineConvexSchema } from 'better-convex-nuxt/schema'

import { api } from '../../../convex/_generated/api'
import { searchNotesArgs, searchNotesMeta } from '../../../shared/schemas/note'

const schema = defineConvexSchema(searchNotesArgs, searchNotesMeta)

export default defineConvexTool({
  schema,
  name: 'search-notes',
  operation: 'query',
  auth: 'optional',
  inputExamples: [
    { query: 'meeting' },
    { query: 'TODO' },
    { query: 'project update' },
  ],
  handler: async (args, _extra, ctx) => {
    const results = await ctx.public.query(api.notes.search, { query: args.query })

    return withSummary(
      { results, total: results.length },
      results.length
        ? `Found ${results.length} note${results.length === 1 ? '' : 's'} matching "${args.query}"`
        : `No notes found matching "${args.query}"`,
    )
  },
})
