import { httpRouter } from 'convex/server'

import { httpAction } from './_generated/server'
import { handleMcp, handleOAuthMetadata } from './mcp'

const http = httpRouter()

// The existing local-backend helper probes this route before returning. This
// inert private-lab response is readiness only; it is not an authentication implementation.
http.route({
  handler: httpAction(async () => Response.json({ session: null })),
  method: 'GET',
  path: '/api/auth/get-session',
})
http.route({ handler: handleMcp, method: 'POST', path: '/mcp' })
http.route({
  handler: handleOAuthMetadata,
  method: 'GET',
  path: '/.well-known/oauth-protected-resource/mcp',
})
http.route({
  handler: handleOAuthMetadata,
  method: 'GET',
  path: '/.well-known/oauth-authorization-server',
})

export default http
