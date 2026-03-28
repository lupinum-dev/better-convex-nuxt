/**
 * MCP Tool: List Notes (Level 1 — query, read-only)
 *
 * Demonstrates: operation: 'query' auto-derives readOnlyHint annotations.
 */
import { defineConvexTool } from 'better-convex-nuxt/mcp'
import { defineConvexSchema } from 'better-convex-nuxt/schema'
import { serverConvexQuery } from 'better-convex-nuxt/server'

import { api } from '../../../convex/_generated/api'

const schema = defineConvexSchema({}, { description: 'List all notes (most recent first)' })

export default defineConvexTool({
  schema,
  operation: 'query',
  handler: async () => {
    return await serverConvexQuery(api.notes.list, {})
  },
})
