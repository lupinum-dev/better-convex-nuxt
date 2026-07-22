import { defineEventHandler, sendWebResponse, toWebRequest } from 'h3'

import { labOAuthSubject, requireLabOAuthAccess } from '../../../../oauth-fixture'
import {
  createExactCallNotesOperations,
  importExactCallPrivateKey,
} from '../../../exact-call/notes-client'
import { createNitroNotesMcpHandler } from '../../../notes-handler'

function requiredEnvironment(name: string, maximum = 4_096): string {
  const value = process.env[name]
  if (!value || value.length > maximum)
    throw new Error('The private Nitro exact-call lab is not configured')
  return value
}

const exactCallEndpoint = new URL(requiredEnvironment('BCN_VNEXT_EXACT_CALL_ENDPOINT'))
const exactCallKeyId = requiredEnvironment('BCN_VNEXT_EXACT_CALL_KEY_ID', 64)
const exactCallPrivateKey = importExactCallPrivateKey(
  JSON.parse(requiredEnvironment('BCN_VNEXT_EXACT_CALL_PRIVATE_JWK', 2_048)),
)
const handler = createNitroNotesMcpHandler(
  (access) =>
    createExactCallNotesOperations({
      access,
      endpoint: exactCallEndpoint,
      keyId: exactCallKeyId,
      privateKey: exactCallPrivateKey,
    }),
  '/api/mcp',
)

function resourceServerUrl(): URL {
  const origin = process.env.BCN_VNEXT_MCP_PUBLIC_ORIGIN
  if (!origin) throw new Error('The private Nitro OAuth lab origin is missing')
  return new URL('/api/mcp', origin)
}

function actorForSubject(subject: string) {
  if (subject === 'alice') {
    return { role: 'owner' as const, subject, tenantId: 'tenant-a' }
  }
  if (subject === 'bob') {
    return { role: 'editor' as const, subject, tenantId: 'tenant-b' }
  }
  return null
}

export default defineEventHandler(async (event) => {
  const request = toWebRequest(event)
  const authInfo = await requireLabOAuthAccess(request, resourceServerUrl())
  if (authInfo instanceof Response) return sendWebResponse(event, authInfo)

  const actor = actorForSubject(labOAuthSubject(authInfo))
  if (!actor) {
    return sendWebResponse(
      event,
      Response.json(
        { code: 'MCP_INVALID_TOKEN' },
        { headers: { 'cache-control': 'no-store' }, status: 401 },
      ),
    )
  }
  return sendWebResponse(event, await handler.fetch(request, { actor, authInfo }))
})
