import { defineConvexTool, withSummary } from 'better-convex-nuxt/mcp'
import { defineConvexSchema } from 'better-convex-nuxt/schema'

import { api } from '../../../convex/_generated/api'
import { createNoteArgs, createNoteMeta } from '../../../shared/schemas/note'

const schema = defineConvexSchema(createNoteArgs, createNoteMeta)

export default defineConvexTool({
  schema,
  name: 'create-note',
  handler: async (args, _extra, ctx) => {
    const noteId = await ctx.mutation(api.notes.add, args)
    return withSummary({ id: noteId }, `Created note "${args.title}"`)
  },
})
