import { createError } from 'h3'
import { useEvent } from 'nitropack/runtime'
import { z } from 'zod'

import { useMcpSession } from '#trellis/mcp'
import { defineMcpTool } from '#trellis/mcp/advanced'

import { resolveHarnessMcpAuth } from '../../support/mcp-auth-helpers'

interface InternalHarnessSessionData {
  preferredSearch?: string
  registeredShortcuts?: string[]
}

export default defineMcpTool({
  name: 'set-session-preference',
  description: 'Remember the current search preference inside the MCP session.',
  enabled: async (event) => !!(await resolveHarnessMcpAuth(event)),
  inputSchema: {
    preferredSearch: z
      .string()
      .describe('The search term or workflow preference to keep in session state'),
  },
  handler: async ({ preferredSearch }) => {
    if (!(await resolveHarnessMcpAuth(useEvent()))) {
      throw createError({ statusCode: 403, message: 'Authentication required.' })
    }

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
