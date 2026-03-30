import { defineTool } from '#convex/mcp'

import { api } from '../../../convex/_generated/api'
import { bulkDeleteNotes } from '../../../shared/schemas/note'

export default defineTool({
  schema: bulkDeleteNotes,
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
      return ctx.blocked('None of the specified notes exist')
    }

    return ctx.preview({
      summary: `Will permanently delete ${found.length} note${found.length === 1 ? '' : 's'}: ${found.map(note => `"${note!.title}"`).join(', ')}`,
      warn: missing > 0 ? `${missing} ID(s) not found and will be skipped` : undefined,
      affects: { notes: found.length },
    })
  },
  handler: async (args, ctx) => {
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

    return ctx.ok({ deleted, skipped, total: args.ids.length })
  },
})
