import { defineTool } from '#convex/mcp'

import { api } from '../../../convex/_generated/api'
import { deleteNote } from '../../../shared/schemas/note'

export default defineTool({
  schema: deleteNote,
  name: 'delete-note',
  destructive: true,
  preview: async (args, ctx) => {
    const note = await ctx.query(api.notes.get, { id: args.id })
    if (!note) return ctx.blocked('Note not found')
    return ctx.preview({
      summary: `Will permanently delete "${note.title}"`,
      affects: { notes: 1 },
    })
  },
  handler: async (args, _extra, ctx) => {
    await ctx.mutation(api.notes.remove, args)
    return ctx.ok({ deleted: true, id: args.id })
  },
})
