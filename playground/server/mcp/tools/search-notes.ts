/**
 * MCP Tool: Search Notes (auth: 'optional' + explicit inputExamples)
 *
 * Demonstrates:
 * - auth: 'optional' — works for everyone (auth available to middleware if needed)
 * - operation: 'query'
 * - explicit inputExamples (instead of auto-generated from schema)
 * - withSummary for human-readable responses
 */
import { defineConvexTool, withSummary } from 'better-convex-nuxt/mcp'
import { defineConvexSchema } from 'better-convex-nuxt/schema'
import { serverConvexQuery } from 'better-convex-nuxt/server'

import { api } from '../../../convex/_generated/api'
import { searchNotesArgs, searchNotesMeta } from '../../../shared/schemas/note'

const schema = defineConvexSchema(searchNotesArgs, searchNotesMeta)

export default defineConvexTool({
  schema,
  name: 'search-notes',
  operation: 'query',

  // Optional auth: works for everyone, auth available in middleware if needed
  auth: 'optional',

  // Explicit inputExamples (overrides auto-generation from schema.meta.fields)
  inputExamples: [
    { query: 'meeting' },
    { query: 'TODO' },
    { query: 'project update' },
  ],

  handler: async (args, _extra) => {
    const results = await serverConvexQuery(api.notes.search, { query: args.query })

    if (results.length === 0) {
      return withSummary(
        { results: [], total: 0 },
        `No notes found matching "${args.query}"`,
      )
    }

    return withSummary(
      { results, total: results.length },
      `Found ${results.length} note${results.length === 1 ? '' : 's'} matching "${args.query}"`,
    )
  },
})
