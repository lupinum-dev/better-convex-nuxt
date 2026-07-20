import { defineEventHandler, sendWebResponse, toWebRequest } from 'h3'

import { bindPackedRuntimeFingerprint } from '../../shared/release-fingerprint'
import { getConvexRuntimeConfig } from '../../utils/runtime-config'
import { proxyMcpRequest } from './proxy'
import { buildMcpTopology } from './topology'

function unavailable(code: string, status: number): Response {
  return Response.json(
    { code },
    { headers: { 'cache-control': 'no-store', 'content-type': 'application/json' }, status },
  )
}

export default defineEventHandler(async (event) => {
  const config = getConvexRuntimeConfig()
  if (config.auth === false || !config.auth.mcp) {
    return await sendWebResponse(
      event,
      bindPackedRuntimeFingerprint(unavailable('BCN_MCP_DISABLED', 404)),
    )
  }
  if (!config.auth.publicOrigin || !config.siteUrl) {
    return await sendWebResponse(
      event,
      bindPackedRuntimeFingerprint(unavailable('BCN_MCP_CONFIG_INVALID', 503)),
    )
  }

  const topology = buildMcpTopology(config.auth.publicOrigin, config.siteUrl)
  const response = await proxyMcpRequest({ request: toWebRequest(event), topology })
  return await sendWebResponse(event, bindPackedRuntimeFingerprint(response))
})
