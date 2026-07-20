import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { describe, expect, it } from 'vitest'

import { topologyConformanceVectors } from '../../internal/labs/mcp-topology/conformance-vectors'
import { NeutralNotesApplication } from '../../internal/labs/mcp-topology/neutral/notes-application'
import {
  createNitroNotesMcpHandler,
  NITRO_MCP_LAB_MAX_BODY_BYTES,
  type NitroNotesMcpHandler,
  type NitroNotesVerifiedAccess,
} from '../../internal/labs/mcp-topology/nitro/notes-handler'

const AUTHORIZATION_HEADER_SENTINEL = 'authorization-header-must-not-escape'
const OWNER_ACCESS = Object.freeze<NitroNotesVerifiedAccess>({
  actor: { role: 'owner', subject: 'alice', tenantId: 'tenant-a' },
  authInfo: { clientId: 'client-a', scopes: ['notes'], token: 'token-must-not-escape' },
})

function createApplication(): NeutralNotesApplication {
  return new NeutralNotesApplication(
    {
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
    },
    () => 1_800_000_000_000,
  )
}

function connectClient(
  handler: NitroNotesMcpHandler,
  access: NitroNotesVerifiedAccess,
  responseBodies: string[],
): { client: Client; connect: Promise<void> } {
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const response = await handler.fetch(new Request(input, init), access)
    responseBodies.push(await response.clone().text())
    return response
  }
  const transport = new StreamableHTTPClientTransport(new URL('https://mcp-lab.invalid/mcp'), {
    fetch,
    requestInit: {
      headers: { authorization: `Bearer ${AUTHORIZATION_HEADER_SENTINEL}` },
    },
  })
  const client = new Client({ name: `client-${access.authInfo.clientId}`, version: '0.0.0' })
  return { client, connect: client.connect(transport) }
}

describe('vNext Nitro-native MCP topology probe', () => {
  it('fails closed at the fetch boundary before the SDK parses an unbounded body', async () => {
    const handler = createNitroNotesMcpHandler(createApplication())

    try {
      const rejectedOrigin = await handler.fetch(
        new Request('https://mcp-lab.invalid/mcp', {
          headers: {
            'content-type': 'application/json',
            origin: 'https://attacker.invalid',
          },
          method: 'POST',
          body: '{}',
        }),
        OWNER_ACCESS,
      )
      expect(rejectedOrigin.status).toBe(403)
      expect(rejectedOrigin.headers.get('cache-control')).toBe('no-store')

      const rejectedEncoding = await handler.fetch(
        new Request('https://mcp-lab.invalid/mcp', {
          body: '{}',
          headers: {
            'content-encoding': 'gzip',
            'content-type': 'application/json',
          },
          method: 'POST',
        }),
        OWNER_ACCESS,
      )
      expect(rejectedEncoding.status).toBe(415)
      await expect(rejectedEncoding.json()).resolves.toEqual({
        code: 'MCP_REQUEST_ENCODING_UNSUPPORTED',
      })

      const rejectedDeclaredSize = await handler.fetch(
        new Request('https://mcp-lab.invalid/mcp', {
          body: '{}',
          headers: {
            'content-length': String(NITRO_MCP_LAB_MAX_BODY_BYTES + 1),
            'content-type': 'application/json',
          },
          method: 'POST',
        }),
        OWNER_ACCESS,
      )
      expect(rejectedDeclaredSize.status).toBe(413)

      const rejectedLengthMismatch = await handler.fetch(
        new Request('https://mcp-lab.invalid/mcp', {
          body: '{}',
          headers: { 'content-length': '3', 'content-type': 'application/json' },
          method: 'POST',
        }),
        OWNER_ACCESS,
      )
      expect(rejectedLengthMismatch.status).toBe(400)
      await expect(rejectedLengthMismatch.json()).resolves.toEqual({
        code: 'MCP_REQUEST_LENGTH_MISMATCH',
      })

      const stalledRequest = new Request('https://mcp-lab.invalid/mcp', {
        body: new ReadableStream<Uint8Array>({ start() {} }),
        duplex: 'half',
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      } as RequestInit & { duplex: 'half' })
      const timedOut = await handler.fetch(stalledRequest, OWNER_ACCESS)
      expect(timedOut.status).toBe(408)
      await expect(timedOut.json()).resolves.toEqual({ code: 'MCP_REQUEST_BODY_TIMEOUT' })

      const abortController = new AbortController()
      const abortedRequest = new Request('https://mcp-lab.invalid/mcp', {
        body: new ReadableStream<Uint8Array>({ start() {} }),
        duplex: 'half',
        headers: { 'content-type': 'application/json' },
        method: 'POST',
        signal: abortController.signal,
      } as RequestInit & { duplex: 'half' })
      const abortedResponse = handler.fetch(abortedRequest, OWNER_ACCESS)
      abortController.abort()
      expect((await abortedResponse).status).toBe(499)
    } finally {
      await handler.close()
    }
  })

  it('keeps identity request-scoped across official HTTP tool and resource traffic', async () => {
    const application = createApplication()
    const handler = createNitroNotesMcpHandler(application)
    const responsesA: string[] = []
    const responsesB: string[] = []
    const tokenA = 'token-a-must-not-escape'
    const tokenB = 'token-b-must-not-escape'
    const accessA: NitroNotesVerifiedAccess = {
      actor: { role: 'owner', subject: 'alice', tenantId: 'tenant-a' },
      authInfo: { clientId: 'client-a', scopes: ['notes'], token: tokenA },
    }
    const accessB: NitroNotesVerifiedAccess = {
      actor: { role: 'editor', subject: 'bob', tenantId: 'tenant-b' },
      authInfo: { clientId: 'client-b', scopes: ['notes'], token: tokenB },
    }
    const connectionA = connectClient(handler, accessA, responsesA)
    const connectionB = connectClient(handler, accessB, responsesB)

    try {
      await Promise.all([connectionA.connect, connectionB.connect])

      const [toolsA, toolsB] = await Promise.all([
        connectionA.client.listTools(),
        connectionB.client.listTools(),
      ])
      expect(toolsA.tools.map((tool) => tool.name).sort()).toEqual(
        topologyConformanceVectors.expectedTools,
      )
      expect(toolsB.tools.map((tool) => tool.name).sort()).toEqual(
        topologyConformanceVectors.expectedTools,
      )
      expect(JSON.stringify(toolsA.tools)).not.toContain('tenantId')
      expect(JSON.stringify(toolsA.tools)).not.toContain('subject')

      const [searchA, searchB] = await Promise.all([
        connectionA.client.callTool(topologyConformanceVectors.search.allowed),
        connectionB.client.callTool({
          name: 'search_notes',
          arguments: { query: '', workspaceId: 'workspace-b' },
        }),
      ])
      expect(searchA.structuredContent).toMatchObject({ matches: [{ id: 'note-a' }] })
      expect(searchA.content).toEqual([
        { text: JSON.stringify(searchA.structuredContent), type: 'text' },
      ])
      expect(searchB.structuredContent).toMatchObject({ matches: [{ id: 'note-b' }] })

      const [renameA, renameB] = await Promise.all([
        connectionA.client.callTool(topologyConformanceVectors.rename.first),
        connectionB.client.callTool({
          name: 'rename_note',
          arguments: { noteId: 'note-b', requestKey: 'rename-b', title: 'Beta renamed' },
        }),
      ])
      expect(renameA.structuredContent).toMatchObject({ noteId: 'note-a', title: 'Alpha renamed' })
      expect(renameA.content).toEqual([
        { text: JSON.stringify(renameA.structuredContent), type: 'text' },
      ])
      expect(renameB.structuredContent).toMatchObject({ noteId: 'note-b', title: 'Beta renamed' })

      const renameReplay = await connectionA.client.callTool(
        topologyConformanceVectors.rename.first,
      )
      expect(renameReplay.structuredContent).toEqual(renameA.structuredContent)
      const renameConflict = await connectionA.client.callTool(
        topologyConformanceVectors.rename.conflicting,
      )
      expect(renameConflict).toMatchObject({
        content: [{ text: JSON.stringify({ code: 'IDEMPOTENCY_CONFLICT' }), type: 'text' }],
        isError: true,
      })

      const [resourceA, resourceB] = await Promise.all([
        connectionA.client.readResource(topologyConformanceVectors.resource),
        connectionB.client.readResource({ uri: 'note://note-b' }),
      ])
      expect(resourceA.contents[0]).toMatchObject({ uri: 'note://note-a' })
      expect(resourceB.contents[0]).toMatchObject({ uri: 'note://note-b' })

      const crossTenant = await connectionA.client.callTool(
        topologyConformanceVectors.search.crossTenant,
      )
      expect(crossTenant).toMatchObject({
        content: [{ text: JSON.stringify({ code: 'ACCESS_DENIED' }), type: 'text' }],
        isError: true,
      })

      const forgedIdentity = await connectionA.client.callTool(
        topologyConformanceVectors.malformedSearch,
      )
      expect(forgedIdentity.isError).toBe(true)

      const [report, deniedDelete] = await Promise.all([
        connectionA.client.callTool({
          name: 'generate_report',
          arguments: { workspaceId: 'workspace-a' },
        }),
        connectionB.client.callTool({
          name: 'delete_workspace',
          arguments: { expectedRevision: 1, workspaceId: 'workspace-b' },
        }),
      ])
      expect(report.structuredContent).toMatchObject({ noteCount: 1, workspaceId: 'workspace-a' })
      expect(deniedDelete).toMatchObject({
        content: [{ text: JSON.stringify({ code: 'ACCESS_DENIED' }), type: 'text' }],
        isError: true,
      })

      const deleted = await connectionA.client.callTool({
        name: 'delete_workspace',
        arguments: { expectedRevision: 1, workspaceId: 'workspace-a' },
      })
      expect(deleted.structuredContent).toMatchObject({
        deletedNoteCount: 1,
        revision: 2,
        workspaceId: 'workspace-a',
      })

      const allResponses = [...responsesA, ...responsesB].join('\n')
      expect(allResponses).not.toContain(tokenA)
      expect(allResponses).not.toContain(tokenB)
      expect(allResponses).not.toContain(AUTHORIZATION_HEADER_SENTINEL)
    } finally {
      await Promise.allSettled([connectionA.client.close(), connectionB.client.close()])
      await handler.close()
    }
  })
})
