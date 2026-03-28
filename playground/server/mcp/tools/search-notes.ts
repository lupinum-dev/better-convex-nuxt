/**
 * MCP Tool: Search Notes (auth: 'optional' + annotations override + explicit inputExamples)
 *
 * Demonstrates:
 * - auth: 'optional' — works without auth, but authed users get enriched results
 * - operation: 'query' with explicit annotation overrides
 * - explicit inputExamples (instead of auto-generated from schema)
 * - withSummary for human-readable responses
 */
import { defineConvexTool } from 'better-convex-nuxt/mcp'
import { withSummary } from 'better-convex-nuxt/mcp'
import { defineConvexSchema } from 'better-convex-nuxt/schema'
import { serverConvexQuery } from 'better-convex-nuxt/server'

import { api } from '../../../convex/_generated/api'
import { searchNotesArgs, searchNotesMeta } from '../../../shared/schemas/note'

const schema = defineConvexSchema(searchNotesArgs, searchNotesMeta)

export default defineConvexTool({
  schema,
  name: 'search-notes',
  operation: 'query',

  // Optional auth: works for everyone, but authed users get metadata
  auth: 'optional',

  // Explicit annotation overrides (normally auto-derived from operation)
  annotations: {
    openWorldHint: true, // search hits external-ish data
  },

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
