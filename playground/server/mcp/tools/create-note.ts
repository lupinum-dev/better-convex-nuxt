/**
 * MCP Tool: Create Note
 *
 * Uses the shared Convex schema directly so validators and metadata
 * stay aligned with the Convex mutation.
 */
import { z } from 'zod'

import { defineConvexSchema } from '../../../../src/runtime/utils/define-convex-schema'
import { serverConvexMutation } from '../../../../src/runtime/server/utils/convex'
import { api } from '../../../convex/_generated/api'
import { createNoteArgs, createNoteMeta } from '../../../shared/schemas/note'

const schema = defineConvexSchema(createNoteArgs, createNoteMeta)
const inputSchema = schema.toMcpInput(z)

export default defineMcpTool({
  description: createNoteMeta.description,
  inputSchema,
  handler: async (args: any) => {
    const noteId = await serverConvexMutation(api.notes.add, {
      title: args.title,
      content: args.content,
    })
    return `Note created with ID: ${noteId}`
  },
})
