import { defineEventHandler, sendWebResponse, toWebRequest } from 'h3'

import { labOAuthMetadataResponse } from '../../../../oauth-fixture'

function resourceServerUrl(): URL {
  const origin = process.env.BCN_VNEXT_MCP_PUBLIC_ORIGIN
  if (!origin) throw new Error('The private Nitro OAuth lab origin is missing')
  return new URL('/api/mcp', origin)
}

export default defineEventHandler(async (event) => {
  const response = labOAuthMetadataResponse(toWebRequest(event), resourceServerUrl())
  if (response) return sendWebResponse(event, response)
})
