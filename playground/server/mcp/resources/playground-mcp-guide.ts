import { defineMcpResource } from '#convex/mcp'

export default defineMcpResource({
  name: 'playground-mcp-guide',
  title: 'Playground MCP Guide',
  description: 'Overview of the MCP features exposed by the playground app.',
  uri: 'app://playground/mcp-guide',
  handler: async (uri: URL) => {
    return {
      contents: [{
        uri: uri.toString(),
        mimeType: 'text/markdown',
        text: [
          '# Better Convex Nuxt Playground MCP',
          '',
          '- Public note tools are available without auth.',
          '- Authenticated tools add tenant-aware task, post, and comment workflows.',
          '- Sessions are enabled, so session IDs persist state across calls.',
          '- Dynamic tool registration is available through the session shortcut demo tools.',
          '- A code-mode demo handler lives at `/mcp/notes-agent`.',
        ].join('\n'),
      }],
    }
  },
})
