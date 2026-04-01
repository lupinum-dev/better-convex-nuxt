import { defineMcpPrompt } from '#convex/mcp'
import { z } from 'zod'

export default defineMcpPrompt({
  name: 'plan-note-workflow',
  description: 'Generate an MCP workflow prompt for the note tools in this playground.',
  inputSchema: {
    goal: z.string().describe('The user goal the assistant should accomplish with MCP tools'),
  },
  handler: async ({ goal }) => {
    return `Use the MCP note tools in this playground to accomplish the following goal: ${goal}.

Prefer search or list before mutating data. If a delete is needed, explain the preview and confirmation flow before calling the destructive tool.`
  },
})
