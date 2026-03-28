/**
 * MCP Tool: Create Note
 *
 * Uses the shared Convex schema directly so validators, metadata,
 * and handler args stay aligned with the Convex mutation.
 */
import { defineConvexSchema } from 'better-convex-nuxt/composables'
import { defineConvexMcpTool } from 'better-convex-nuxt/mcp'
import { serverConvexMutation } from 'better-convex-nuxt/server'

import { api } from '../../../convex/_generated/api'
import { createNoteArgs, createNoteMeta } from '../../../shared/schemas/note'

const schema = defineConvexSchema(createNoteArgs, createNoteMeta)

export default defineConvexMcpTool({
  schema,
  handler: async (args) => {
    const noteId = await serverConvexMutation(api.notes.add, args)
    return `Note created with ID: ${noteId}`
  },
})
