import { z } from 'zod'
import { defineConvexSchema } from 'better-convex-nuxt/schema'
import { withSummary } from 'better-convex-nuxt/mcp'

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
  enabled: (event) => !!event.context.mcpAuth,
  outputSchema: {
    format: z.enum(['json', 'csv']),
    content: z.string(),
    noteCount: z.number(),
    exportedAt: z.string(),
  },
  handler: async (args, _extra, ctx) => {
    const notes = await ctx.public.query(api.notes.list)
    const exportedAt = new Date().toISOString()

    const content = args.format === 'csv'
      ? [
          'id,title,content,createdAt',
          ...notes.map(note =>
            `"${note._id}","${(note.title ?? '').replace(/"/g, '""')}","${note.content.replace(/"/g, '""')}",${note.createdAt}`,
          ),
        ].join('\n')
      : JSON.stringify(notes, null, 2)

    return withSummary(
      { format: args.format, content, noteCount: notes.length, exportedAt },
      `Exported ${notes.length} notes as ${args.format.toUpperCase()}`,
    )
  },
})
