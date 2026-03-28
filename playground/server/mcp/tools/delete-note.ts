/**
 * MCP Tool: Delete Note (Level 3 — destructive with preview)
 *
 * Demonstrates: destructive confirmation flow, preview function,
 * two-call pattern (first call returns preview, second with _confirmed executes).
 */
import { defineConvexTool } from 'better-convex-nuxt/mcp'
import { defineConvexSchema } from 'better-convex-nuxt/schema'
import { serverConvexMutation, serverConvexQuery } from 'better-convex-nuxt/server'

import { api } from '../../../convex/_generated/api'
import { deleteNoteArgs, deleteNoteMeta } from '../../../shared/schemas/note'

const schema = defineConvexSchema(deleteNoteArgs, deleteNoteMeta)

export default defineConvexTool({
  schema,
  name: 'delete-note',
  destructive: true,
  preview: async (args) => {
    const note = await serverConvexQuery(api.notes.get, { id: args.id })
    if (!note) {
      return { summary: 'Note not found', blocked: true }
    }
    return {
      summary: `Will permanently delete "${note.title}"`,
      affects: { notes: 1 },
    }
  },
  handler: async (args) => {
    await serverConvexMutation(api.notes.remove, args)
    return { deleted: true, id: args.id }
  },
})
