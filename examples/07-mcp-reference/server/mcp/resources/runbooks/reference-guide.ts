import { defineMcpResource } from '#trellis/mcp'

export default defineMcpResource({
  name: 'mcp-reference-guide',
  title: 'MCP Reference Guide',
  description: 'Overview of the MCP recordAccess exposed by Example 07.',
  uri: 'app://mcp-reference/guide',
  handler: async (uri: URL) => ({
    contents: [
      {
        uri: uri.toString(),
        mimeType: 'text/markdown',
        text: [
          '# Example 07 MCP Reference',
          '',
          '- Public tools expose public runbooks without auth.',
          '- Scoped tools create, update, and delete workspace runbooks through the same Convex permission pipeline as the app UI.',
          '- MCP bearer tokens are hashed at rest and only shown once at creation time.',
          '- Sessions store a preferred workflow focus and support dynamic per-session tool registration.',
          '- A separate code-mode endpoint lives at `/mcp/runbook-agent`.',
        ].join('\n'),
      },
    ],
  }),
})
