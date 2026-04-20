import { z } from 'zod'

import { defineMcpPrompt } from '#trellis/mcp'

export default defineMcpPrompt({
  name: 'plan-runbook-workflow',
  description: 'Plan a safe MCP workflow for this example before mutating any runbooks.',
  inputSchema: {
    goal: z.string().describe('The workspace outcome the assistant should accomplish'),
  },
  handler: async ({ goal }) => {
    return `Use the MCP reference tools to accomplish this goal: ${goal}

Start with public search or workspace list tools. Prefer reading before mutating. If deleting runbooks, explain the preview + confirmation flow before issuing the destructive call.`
  },
})
