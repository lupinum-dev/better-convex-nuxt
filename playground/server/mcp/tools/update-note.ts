import { wrapError } from 'better-convex-nuxt/mcp'
import { defineConvexSchema } from 'better-convex-nuxt/schema'

import { api } from '../../../convex/_generated/api'
import { updateNoteArgs, updateNoteMeta } from '../../../shared/schemas/note'
import { defineConvexTool } from '../utils/tools'

const schema = defineConvexSchema(updateNoteArgs, updateNoteMeta)

export default defineConvexTool({
  schema,
  name: 'update-note',
  auth: 'required',
  middleware: async (args, ctx, next) => {
    const note = await ctx.query(api.notes.get, { id: args.id })
    if (!note) {
      return wrapError('not_found', `Note "${args.id}" not found.`)
    }

    const allowed = ctx.can('post.update', { ownerId: note.userId })
    if (!allowed) {
      return wrapError('auth', 'You do not have permission to update this note.')
    }

    return next()
  },
  handler: async (args, _extra, ctx) => {
    await ctx.mutation(api.notes.update, args)
    return { updated: true, id: args.id }
  },
})
