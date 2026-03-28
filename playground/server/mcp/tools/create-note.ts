/**
 * MCP Tool: Create Note (Level 1 — just make it work)
 *
 * Uses defineConvexTool with shared schema. No auth needed.
 * Demonstrates: structured envelope, withSummary, field examples.
 */
import { defineConvexTool, withSummary } from 'better-convex-nuxt/mcp'
import { defineConvexSchema } from 'better-convex-nuxt/schema'
import { serverConvexMutation } from 'better-convex-nuxt/server'

import { api } from '../../../convex/_generated/api'
import { createNoteArgs, createNoteMeta } from '../../../shared/schemas/note'

const schema = defineConvexSchema(createNoteArgs, createNoteMeta)

export default defineConvexTool({
  schema,
  name: 'create-note',
  handler: async (args) => {
    const noteId = await serverConvexMutation(api.notes.add, args)
    return withSummary({ id: noteId, title: args.title }, `Created note "${args.title}"`)
  },
})
