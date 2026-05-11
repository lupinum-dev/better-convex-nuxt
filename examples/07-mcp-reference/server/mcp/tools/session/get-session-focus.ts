import { useMcpSession } from '#trellis/mcp'
import { defineMcpTool } from '#trellis/mcp/advanced'
interface ReferenceSessionData {
  preferredFocus?: string
  registeredShortcuts?: string[]
}

export default defineMcpTool({
  name: 'get-session-focus',
  description: 'Read the current MCP session focus.',
  handler: async () => {
    const session = useMcpSession<ReferenceSessionData>()
    const focus = await session.get('preferredFocus')

    return {
      content: [
        {
          type: 'text',
          text: focus ? `Current session focus: ${focus}` : 'No session focus saved yet.',
        },
      ],
      structuredContent: { focus },
    }
  },
})
