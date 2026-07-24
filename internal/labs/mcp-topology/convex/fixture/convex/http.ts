import { httpRouter } from 'convex/server'

import { getInteractionPage, postInteractionConfirmation } from './interaction_page'
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
http.route({
  handler: getInteractionPage,
  method: 'GET',
  pathPrefix: '/interactions/',
})
http.route({
  handler: postInteractionConfirmation,
  method: 'POST',
  pathPrefix: '/interactions/',
})

export default http
