import { z } from 'zod'

import { useMcpSession } from '#trellis/mcp'
import { defineMcpTool } from '#trellis/mcp/advanced'
interface InternalHarnessSessionData {
  preferredSearch?: string
  registeredShortcuts?: string[]
}

export default defineMcpTool({
  name: 'set-session-preference',
  description: 'Remember the current search preference inside the MCP session.',
  inputSchema: {
    preferredSearch: z
      .string()
      .describe('The search term or workflow preference to keep in session state'),
  },
  handler: async ({ preferredSearch }) => {
    const session = useMcpSession<InternalHarnessSessionData>()
    await session.set('preferredSearch', preferredSearch)

    return {
      content: [{ type: 'text', text: `Stored session preference "${preferredSearch}".` }],
      structuredContent: {
        preferredSearch,
      },
    }
  },
})
