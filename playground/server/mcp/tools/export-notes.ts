/**
 * MCP Tool: Export Notes (Level 4 — action + enabled guard + outputSchema)
 *
 * Demonstrates:
 * - operation: 'action' — external side-effect (simulated export)
 * - enabled guard — tool only visible when authenticated
 * - outputSchema — explicit Zod schema for structured output
 * - auth: 'required' with permission
 * - enum field metadata
 */
import { z } from 'zod'
import { defineConvexSchema } from 'better-convex-nuxt/schema'
import { withSummary } from 'better-convex-nuxt/mcp'
import { serverConvexQuery } from 'better-convex-nuxt/server'

import { api } from '../../../convex/_generated/api'
import { exportNotesArgs, exportNotesMeta } from '../../../shared/schemas/note'
import { defineConvexTool } from '../utils/tools'

const schema = defineConvexSchema(exportNotesArgs, exportNotesMeta)

export default defineConvexTool({
  schema,
  name: 'export-notes',
  operation: 'action',
  auth: 'required',
  require: 'post.read',
  tags: ['export', 'admin'],

  // Tool only appears when user is authenticated
  enabled: (event) => {
    return !!event.context.mcpAuth
  },

  // Output schema describes your data — the framework auto-wraps it in the envelope
  outputSchema: {
    format: z.enum(['json', 'csv']),
    content: z.string(),
    noteCount: z.number(),
    exportedAt: z.string(),
  },

  handler: async (args) => {
    const notes = await serverConvexQuery(api.notes.list, {})

    const exportedAt = new Date().toISOString()

    let content: string
    if (args.format === 'csv') {
      const header = 'id,title,content,createdAt'
      const rows = notes.map(n =>
        `"${n._id}","${(n.title ?? '').replace(/"/g, '""')}","${n.content.replace(/"/g, '""')}",${n.createdAt}`,
      )
      content = [header, ...rows].join('\n')
    }
    else {
      content = JSON.stringify(notes, null, 2)
    }

    return withSummary(
      { format: args.format, content, noteCount: notes.length, exportedAt },
      `Exported ${notes.length} notes as ${args.format.toUpperCase()}`,
    )
  },
})
