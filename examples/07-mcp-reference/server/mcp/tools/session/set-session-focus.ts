import { z } from 'zod'

import { defineMcpTool, useMcpSession } from '#trellis/mcp'

interface ReferenceSessionData {
  preferredFocus?: string
  registeredShortcuts?: string[]
}

export default defineMcpTool({
  name: 'set-session-focus',
  description: 'Store the current workflow focus in MCP session state.',
  inputSchema: {
    focus: z.string().describe('The workflow focus to keep in session state'),
  },
  handler: async ({ focus }) => {
    const session = useMcpSession<ReferenceSessionData>()
    await session.set('preferredFocus', focus)

    return {
      content: [{ type: 'text', text: `Stored session focus "${focus}".` }],
      structuredContent: { focus },
    }
  },
})
