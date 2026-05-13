import { createError } from 'h3'
import { useEvent } from 'nitropack/runtime'
import { z } from 'zod'

import { useMcpSession } from '#trellis/mcp'
import { defineMcpTool } from '#trellis/mcp/advanced'
interface ReferenceSessionData {
  preferredFocus?: string
  registeredShortcuts?: string[]
}

export default defineMcpTool({
  name: 'set-session-focus',
  description: 'Store the current workflow focus in MCP session state.',
  enabled: (event) => !!event.context.mcpAuth,
  inputSchema: {
    focus: z.string().describe('The workflow focus to keep in session state'),
  },
  handler: async ({ focus }) => {
    if (!useEvent().context.mcpAuth) {
      throw createError({ statusCode: 403, message: 'Authentication required.' })
    }

    const session = useMcpSession<ReferenceSessionData>()
    await session.set('preferredFocus', focus)

    return {
      content: [{ type: 'text', text: `Stored session focus "${focus}".` }],
      structuredContent: { focus },
    }
  },
})
