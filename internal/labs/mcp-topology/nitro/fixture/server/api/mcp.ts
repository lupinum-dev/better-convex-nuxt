import { defineEventHandler, sendWebResponse, toWebRequest } from 'h3'

import { NeutralNotesApplication } from '../../../../neutral/notes-application'
import { labOAuthSubject, requireLabOAuthAccess } from '../../../../oauth-fixture'
import { createNitroNotesMcpHandler } from '../../../notes-handler'

const application = new NeutralNotesApplication({
  notes: [
    {
      body: 'Alpha body',
      id: 'note-a',
      title: 'Alpha',
      workspaceId: 'workspace-a',
    },
    {
      body: 'Beta body',
      id: 'note-b',
      title: 'Beta',
      workspaceId: 'workspace-b',
    },
  ],
  workspaces: [
    { id: 'workspace-a', name: 'Workspace A', tenantId: 'tenant-a' },
    { id: 'workspace-b', name: 'Workspace B', tenantId: 'tenant-b' },
  ],
})
const handler = createNitroNotesMcpHandler(application, '/api/mcp')

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
