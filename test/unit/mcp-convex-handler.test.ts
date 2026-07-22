import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { McpServer } from '@modelcontextprotocol/server'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { createConvexMcpHandler } from '../../packages/mcp/src/handler'
import type { McpAccessVerifier } from '../../packages/mcp/src/index'

const resource = new URL('https://notes.example.test/mcp')
const bearer = 'mcp-handler-bearer-sentinel'
const oauthMetadata = {
  authorization_endpoint: 'https://issuer.example.test/authorize',
  code_challenge_methods_supported: ['S256'],
  grant_types_supported: ['authorization_code'],
  issuer: 'https://issuer.example.test/',
  response_types_supported: ['code'],
  revocation_endpoint: 'https://issuer.example.test/revoke',
  scopes_supported: ['notes:read', 'notes:write'],
  token_endpoint: 'https://issuer.example.test/token',
  token_endpoint_auth_methods_supported: ['none'],
}

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
    const handler = createConvexMcpHandler<typeof application>({
      resource,
      verifier: accessVerifier(),
      oauthMetadata,
      resourceName: 'Neutral notes',
      scopesSupported: ['notes:read', 'notes:write'],
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
      oauthMetadata,
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

  it('serves fixed RFC 9728 metadata and binds every challenge to its exact URL', async () => {
    const handler = createConvexMcpHandler({
      resource,
      verifier: accessVerifier(),
      oauthMetadata,
      resourceName: 'Neutral notes',
      scopesSupported: ['notes:read', 'notes:write'],
      createServer() {
        return new McpServer({ name: 'metadata-proof', version: '0.1.0' })
      },
    })
    const protectedResourceUrl = new URL(
      'https://notes.example.test/.well-known/oauth-protected-resource/mcp',
    )
    const protectedResponse = await handler.fetch({}, new Request(protectedResourceUrl))
    expect(protectedResponse.status).toBe(200)
    await expect(protectedResponse.json()).resolves.toEqual({
      authorization_servers: ['https://issuer.example.test/'],
      resource: resource.href,
      resource_name: 'Neutral notes',
      scopes_supported: ['notes:read', 'notes:write'],
    })

    const authorizationResponse = await handler.fetch(
      {},
      new Request('https://notes.example.test/.well-known/oauth-authorization-server'),
    )
    expect(authorizationResponse.status).toBe(200)
    await expect(authorizationResponse.json()).resolves.toEqual(oauthMetadata)

    const denied = await handler.fetch(
      {},
      new Request('https://attacker-selected.invalid/mcp?resource=https://attacker.invalid', {
        method: 'POST',
        headers: {
          authorization: 'Bearer wrong',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ resource: 'https://attacker.invalid' }),
      }),
    )
    expect(denied.status).toBe(401)
    const challenge = denied.headers.get('www-authenticate')
    expect(challenge).toContain(
      'resource_metadata="https://notes.example.test/.well-known/oauth-protected-resource/mcp"',
    )
    expect(challenge).not.toContain('attacker')
  })

  it('fails at construction for an insecure or malformed authorization-server issuer', () => {
    expect(() =>
      createConvexMcpHandler({
        resource,
        verifier: accessVerifier(),
        oauthMetadata: { ...oauthMetadata, issuer: 'http://issuer.example.test/' },
        createServer() {
          return new McpServer({ name: 'invalid', version: '0.1.0' })
        },
      }),
    ).toThrow()
  })

  it('rejects foreign issuers and never accepts a bearer from query or body', async () => {
    let factoryCalls = 0
    const foreignIssuerVerifier: McpAccessVerifier = {
      async verifyAccessToken() {
        return {
          access: {
            issuer: 'https://foreign-issuer.example.test/',
            subject: 'foreign-subject',
            clientId: 'foreign-client',
            resource: resource.href,
            scopes: ['notes:read'],
          },
          expiresAt: Math.floor(Date.now() / 1_000) + 300,
        }
      },
    }
    const foreignHandler = createConvexMcpHandler({
      resource,
      verifier: foreignIssuerVerifier,
      oauthMetadata,
      createServer() {
        factoryCalls += 1
        return new McpServer({ name: 'must-not-run', version: '0.1.0' })
      },
    })
    const foreignResponse = await foreignHandler.fetch(
      {},
      new Request(resource, {
        method: 'POST',
        headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
        body: '{}',
      }),
    )
    expect(foreignResponse.status).toBe(401)

    const headerOnlyHandler = createConvexMcpHandler({
      resource,
      verifier: accessVerifier(),
      oauthMetadata,
      createServer() {
        factoryCalls += 1
        return new McpServer({ name: 'must-not-run', version: '0.1.0' })
      },
    })
    for (const request of [
      new Request(`${resource.href}?access_token=${bearer}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
      new Request(resource, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ access_token: bearer }),
      }),
    ]) {
      const response = await headerOnlyHandler.fetch({}, request)
      expect(response.status).toBe(401)
      expect(await response.text()).not.toContain(bearer)
    }
    expect(factoryCalls).toBe(0)
  })
})
