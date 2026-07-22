import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { McpServer } from '@modelcontextprotocol/server'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { createConvexMcpHandler } from '../../packages/mcp/src/handler'
import type { McpAccessVerifier } from '../../packages/mcp/src/index'

const resource = new URL('https://notes.example.test/mcp')
const bearer = 'mcp-handler-bearer-sentinel'

function accessVerifier(): McpAccessVerifier {
  return {
    async verifyAccessToken(token, expectedResource) {
      if (token !== bearer || expectedResource.href !== resource.href) throw new Error('invalid')
      return {
        access: {
          issuer: 'https://issuer.example.test/',
          subject: 'integration-123',
          clientId: 'client-123',
          resource: resource.href,
          scopes: ['notes:read', 'notes:write'],
        },
        expiresAt: Math.floor(Date.now() / 1_000) + 300,
      }
    },
  }
}

describe('Convex-native official MCP handler composition', () => {
  it('serves explicit read and write tools while keeping bearer data outside application context', async () => {
    const application = {
      notes: new Map([['note-1', 'Alpha']]),
      operations: [] as string[],
    }
    const observedAccess: unknown[] = []
    const observedOfficialAuth: unknown[] = []
    const handler = createConvexMcpHandler({
      resource,
      verifier: accessVerifier(),
      createServer(context, access) {
        observedAccess.push(access)
        const server = new McpServer({ name: 'neutral-notes', version: '0.1.0' })
        server.registerTool(
          'search_notes',
          {
            inputSchema: z.object({ query: z.string() }),
            outputSchema: z.object({ titles: z.array(z.string()) }),
          },
          ({ query }, extra) => {
            observedOfficialAuth.push(extra.http?.authInfo)
            context.operations.push(`search:${access.issuer}:${access.subject}`)
            const output = {
              titles: [...context.notes.values()].filter((title) =>
                title.toLowerCase().includes(query.toLowerCase()),
              ),
            }
            return {
              content: [{ type: 'text', text: JSON.stringify(output) }],
              structuredContent: output,
            }
          },
        )
        server.registerTool(
          'rename_note',
          {
            inputSchema: z.object({ id: z.string(), title: z.string() }),
            outputSchema: z.object({ id: z.string(), title: z.string() }),
          },
          ({ id, title }, extra) => {
            observedOfficialAuth.push(extra.http?.authInfo)
            if (!context.notes.has(id)) throw new Error('missing note')
            context.notes.set(id, title)
            context.operations.push(`rename:${id}:${access.clientId}`)
            const output = { id, title }
            return {
              content: [{ type: 'text', text: JSON.stringify(output) }],
              structuredContent: output,
            }
          },
        )
        return server
      },
    })
    const responseBodies: string[] = []
    const transport = new StreamableHTTPClientTransport(resource, {
      requestInit: { headers: { authorization: `Bearer ${bearer}` } },
      fetch: async (input, init) => {
        const response = await handler.fetch(application, new Request(input, init))
        responseBodies.push(await response.clone().text())
        return response
      },
    })
    const client = new Client(
      { name: 'neutral-notes-client', version: '0.1.0' },
      { versionNegotiation: { mode: { pin: '2026-07-28' } } },
    )

    try {
      await client.connect(transport)
      expect((await client.listTools()).tools.map(({ name }) => name).sort()).toEqual([
        'rename_note',
        'search_notes',
      ])
      const search = await client.callTool({
        name: 'search_notes',
        arguments: { query: 'alpha' },
      })
      expect(search.structuredContent).toEqual({ titles: ['Alpha'] })
      const rename = await client.callTool({
        name: 'rename_note',
        arguments: { id: 'note-1', title: 'Beta' },
      })
      expect(rename.structuredContent).toEqual({ id: 'note-1', title: 'Beta' })
      expect(application.notes.get('note-1')).toBe('Beta')
      expect(application.operations).toEqual([
        'search:https://issuer.example.test/:integration-123',
        'rename:note-1:client-123',
      ])
      expect(observedOfficialAuth).toEqual([undefined, undefined])
      expect(observedAccess.length).toBeGreaterThanOrEqual(4)
      for (const access of observedAccess) {
        expect(access).not.toHaveProperty('token')
        expect(access).not.toHaveProperty('providerReference')
      }
      for (const body of responseBodies) expect(body).not.toContain(bearer)
    } finally {
      await client.close()
    }
  })

  it('uses the official bearer challenge and never constructs an application server when denied', async () => {
    let factoryCalls = 0
    const handler = createConvexMcpHandler({
      resource,
      verifier: accessVerifier(),
      createServer() {
        factoryCalls += 1
        return new McpServer({ name: 'must-not-run', version: '0.1.0' })
      },
    })

    const response = await handler.fetch(
      {},
      new Request(resource, {
        method: 'POST',
        headers: {
          authorization: 'Bearer wrong-token-sentinel',
          'content-type': 'application/json',
        },
        body: '{}',
      }),
    )

    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toMatch(/^Bearer /u)
    expect(factoryCalls).toBe(0)
    const body = await response.text()
    expect(body).not.toContain('wrong-token-sentinel')
    expect(body).not.toContain('mcp-handler-bearer-sentinel')
  })
})
