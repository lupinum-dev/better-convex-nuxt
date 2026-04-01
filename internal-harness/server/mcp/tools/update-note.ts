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

    const isAdmin = ctx.actor?.role === 'owner' || ctx.actor?.role === 'admin'
    const isOwner = !!ctx.actor && note.userId === ctx.actor.userId
    const isMemberOwner = ctx.actor?.role === 'member' && isOwner
    if (!isAdmin && !isMemberOwner) {
      return ctx.error('auth', 'You do not have permission to update this note.')
    }

    return next()
  },
  handler: async (args, ctx) => {
    await ctx.mutation(api.notes.update, args)
    return ctx.ok({ updated: true, id: args.id })
  },
})
