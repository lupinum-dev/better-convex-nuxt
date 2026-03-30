import { defineTool } from '#convex/mcp'

import { api } from '../../../convex/_generated/api'
import { updateNote } from '../../../shared/schemas/note'

export default defineTool({
  schema: updateNote,
  name: 'update-note',
  auth: 'required',
  middleware: async (args, ctx, next) => {
    const note = await ctx.query(api.notes.get, { id: args.id })
    if (!note) {
      return ctx.error('not_found', `Note "${args.id}" not found.`)
    }

    const allowed = ctx.can('post.update', { ownerId: note.userId })
    if (!allowed) {
      return ctx.error('auth', 'You do not have permission to update this note.')
    }

    return next()
  },
  handler: async (args, _extra, ctx) => {
    await ctx.mutation(api.notes.update, args)
    return ctx.ok({ updated: true, id: args.id })
  },
})
