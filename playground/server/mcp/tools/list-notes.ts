/**
 * MCP Tool: List Notes
 *
 * Read-only tool — no input schema needed.
 * Returns all notes from Convex (most recent first).
 */
import { serverConvexQuery } from '../../../../src/runtime/server/utils/convex'
import { api } from '../../../convex/_generated/api'

export default defineMcpTool({
  description: 'List all notes (most recent first)',
  annotations: { readOnlyHint: true, destructiveHint: false },
  handler: async () => {
    const notes = await serverConvexQuery(api.notes.list, {})
    return notes
  },
})
