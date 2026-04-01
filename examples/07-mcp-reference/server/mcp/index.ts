/**
 * The default MCP endpoint for the full reference example.
 * Sessions are enabled in `nuxt.config.ts`, so tools can persist state and register dynamic tools.
 */
export default defineMcpHandler({
  name: 'mcp-reference',
  browserRedirect: '/',
})
