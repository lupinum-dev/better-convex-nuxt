import { defineTool } from '#trellis/mcp'

import { api } from '../../../convex/_generated/api'
import { createNote } from '../../../shared/schemas/note'

export default defineTool({
  schema: createNote,
  name: 'create-note',
  handler: async (args, ctx) => {
    const noteId = await ctx.mutation(api.notes.add, args)
    return ctx.ok({ id: noteId }, `Created note "${args.title}"`)
  },
})
