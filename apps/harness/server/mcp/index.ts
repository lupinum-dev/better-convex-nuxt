import { resolveHarnessMcpAuth } from '../support/mcp-auth-helpers'

/** Default MCP handler for the internal harness. */
export default defineMcpHandler({
  middleware: async (event, next) => {
    await resolveHarnessMcpAuth(event)
    return await next()
  },
})
