import { defineEventHandler, sendWebResponse, toWebRequest } from 'h3'

import { getConvexRuntimeConfig } from '../../utils/runtime-config'
import { buildMcpProtectedResourceMetadata, buildMcpTopology } from './topology'

export default defineEventHandler(async (event) => {
  const request = toWebRequest(event)
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return await sendWebResponse(
      event,
      new Response(null, { headers: { allow: 'GET, HEAD' }, status: 405 }),
    )
  }

  const config = getConvexRuntimeConfig()
  if (config.auth === false || !config.auth.mcp || !config.auth.publicOrigin || !config.siteUrl) {
    return await sendWebResponse(event, new Response(null, { status: 404 }))
  }

  const topology = buildMcpTopology(config.auth.publicOrigin, config.siteUrl)
  const body =
    request.method === 'HEAD' ? null : JSON.stringify(buildMcpProtectedResourceMetadata(topology))
  return await sendWebResponse(
    event,
    new Response(body, {
      headers: {
        'access-control-allow-origin': '*',
        'cache-control': 'public, max-age=300',
        'content-type': 'application/json',
      },
      status: 200,
    }),
  )
})
