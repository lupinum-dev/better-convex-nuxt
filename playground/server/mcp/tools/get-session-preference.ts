import { defineMcpTool, useMcpSession } from '#convex/mcp'

interface PlaygroundSessionData {
  preferredSearch?: string
  registeredShortcuts?: string[]
}

export default defineMcpTool({
  name: 'get-session-preference',
  description: 'Read the search preference stored in the current MCP session.',
  handler: async () => {
    const session = useMcpSession<PlaygroundSessionData>()
    const preferredSearch = await session.get('preferredSearch')

    return {
      content: [{
        type: 'text',
        text: preferredSearch
          ? `Current session preference: "${preferredSearch}".`
          : 'No session preference stored yet.',
      }],
      structuredContent: {
        preferredSearch,
      },
    }
  },
})
