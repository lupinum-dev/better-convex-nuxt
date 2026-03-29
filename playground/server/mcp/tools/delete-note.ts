import { defineConvexTool } from 'better-convex-nuxt/mcp'
import { defineConvexSchema } from 'better-convex-nuxt/schema'

import { api } from '../../../convex/_generated/api'
import { deleteNoteArgs, deleteNoteMeta } from '../../../shared/schemas/note'

const schema = defineConvexSchema(deleteNoteArgs, deleteNoteMeta)

export default defineConvexTool({
  schema,
  name: 'delete-note',
  destructive: true,
  preview: async (args, ctx) => {
    const note = await ctx.query(api.notes.get, { id: args.id })
    if (!note) return { summary: 'Note not found', blocked: true }
    return {
      summary: `Will permanently delete "${note.title}"`,
      affects: { notes: 1 },
    }
  },
  handler: async (args, _extra, ctx) => {
    await ctx.mutation(api.notes.remove, args)
    return { deleted: true, id: args.id }
  },
})
