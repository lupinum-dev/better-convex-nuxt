import { defineConvexSchema } from 'better-convex-nuxt/schema'

import { api } from '../../../convex/_generated/api'
import { bulkDeleteNotesArgs, bulkDeleteNotesMeta } from '../../../shared/schemas/note'
import { defineConvexTool } from '../utils/tools'

const schema = defineConvexSchema(bulkDeleteNotesArgs, bulkDeleteNotesMeta)

export default defineConvexTool({
  schema,
  name: 'bulk-delete-notes',
  auth: 'required',
  require: 'post.delete',
  destructive: true,
  tags: ['bulk', 'dangerous'],
  rateLimit: { max: 5, window: '1m' },
  maxItems: { field: 'ids', limit: 10 },
  middleware: async (args, ctx, next) => {
    console.log(
      `[audit] bulk-delete-notes: user=${ctx.actor?.userId} deleting ${args.ids.length} notes`,
    )
    return next()
  },
  preview: async (args, ctx) => {
    const notes = await Promise.all(
      args.ids.map(id => ctx.query(api.notes.get, { id })),
    )
    const found = notes.filter(Boolean)
    const missing = args.ids.length - found.length

    if (found.length === 0) {
      return { summary: 'None of the specified notes exist', blocked: true }
    }

    return {
      summary: `Will permanently delete ${found.length} note${found.length === 1 ? '' : 's'}: ${found.map(note => `"${note!.title}"`).join(', ')}`,
      warn: missing > 0 ? `${missing} ID(s) not found and will be skipped` : undefined,
      affects: { notes: found.length },
    }
  },
  handler: async (args, _extra, ctx) => {
    let deleted = 0
    const skipped: { id: string; reason: string }[] = []

    for (const id of args.ids) {
      try {
        await ctx.mutation(api.notes.remove, { id })
        deleted++
      }
      catch (error) {
        skipped.push({
          id,
          reason: error instanceof Error ? error.message : String(error),
        })
      }
    }

    return { deleted, skipped, total: args.ids.length }
  },
})
