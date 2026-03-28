/**
 * MCP Tool: Create Note
 *
 * Demonstrates the "define once, use everywhere" pattern:
 * - Same validators used in convex/notes.ts mutation
 * - Same metadata drives the MCP tool description + field descriptions
 * - defineConvexSchema().toMcpInput() converts to Zod for MCP
 */
import { defineConvexSchema } from '../../../../src/runtime/utils/define-convex-schema'
import { serverConvexMutation } from '../../../../src/runtime/server/utils/convex'
import { api } from '../../../convex/_generated/api'
import { createNoteArgs, createNoteMeta } from '../../../shared/schemas/note'

const schema = defineConvexSchema(createNoteArgs, createNoteMeta)
const inputSchema = await schema.toMcpInput()

export default defineMcpTool({
  description: createNoteMeta.description,
  inputSchema,
  handler: async (args: any, extra: any) => {
    const noteId = await serverConvexMutation(extra.event, api.notes.add, {
      title: args.title,
      content: args.content,
    })
    return `Note created with ID: ${noteId}`
  },
})
