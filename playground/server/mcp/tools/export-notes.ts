import { defineTool } from '#convex/mcp'
import { z } from 'zod'

import { api } from '../../../convex/_generated/api'
import { exportNotes } from '../../../shared/schemas/note'

export default defineTool({
  schema: exportNotes,
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
    const notes = await ctx.query(api.notes.list)
    const exportedAt = new Date().toISOString()

    const content = args.format === 'csv'
      ? [
          'id,title,content,createdAt',
          ...notes.map(note =>
            `"${note._id}","${(note.title ?? '').replace(/"/g, '""')}","${note.content.replace(/"/g, '""')}",${note.createdAt}`,
          ),
        ].join('\n')
      : JSON.stringify(notes, null, 2)

    return ctx.ok(
      { format: args.format, content, noteCount: notes.length, exportedAt },
      `Exported ${notes.length} notes as ${args.format.toUpperCase()}`,
    )
  },
})
