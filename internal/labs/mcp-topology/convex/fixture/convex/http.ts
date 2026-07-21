import { httpRouter } from 'convex/server'

import { handleMcp, handleOAuthMetadata } from './mcp'

const http = httpRouter()

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
