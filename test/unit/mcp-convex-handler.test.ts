import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/server'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { createConvexMcpHandler } from '../../packages/mcp/src/handler'
import type { McpAccessVerifier } from '../../packages/mcp/src/index'
import { maximumMcpRequestBytes, mcpRequestTimeoutMs } from '../../packages/mcp/src/transport'

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
        const server = new McpServer({
          name: 'neutral-notes',
          version: '0.1.0',
        })
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
              content: [
                {
                  type: 'text',
                  text:
                    output.titles.length === 0
                      ? 'No notes matched.'
                      : `${output.titles.length} note matched: ${output.titles.join(', ')}.`,
                },
              ],
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
              content: [{ type: 'text', text: `Renamed ${id} to “${title}”.` }],
              structuredContent: output,
            }
          },
        )
        server.registerResource(
          'note',
          new ResourceTemplate('note://{id}', { list: undefined }),
          {
            description: 'Read one neutral note.',
            mimeType: 'text/plain',
          },
          async (uri, { id }) => {
            const title = context.notes.get(String(id))
            if (title === undefined) throw new Error('resource unavailable')
            return {
              contents: [{ uri: uri.href, mimeType: 'text/plain', text: title }],
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
      expect(search.content).toEqual([{ type: 'text', text: '1 note matched: Alpha.' }])
      const rename = await client.callTool({
        name: 'rename_note',
        arguments: { id: 'note-1', title: 'Beta' },
      })
      expect(rename.structuredContent).toEqual({ id: 'note-1', title: 'Beta' })
      expect(rename.content).toEqual([{ type: 'text', text: 'Renamed note-1 to “Beta”.' }])
      await expect(client.listResourceTemplates()).resolves.toMatchObject({
        resourceTemplates: [
          {
            name: 'note',
            uriTemplate: 'note://{id}',
            mimeType: 'text/plain',
          },
        ],
      })
      await expect(client.readResource({ uri: 'note://note-1' })).resolves.toMatchObject({
        contents: [{ uri: 'note://note-1', mimeType: 'text/plain', text: 'Beta' }],
      })
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

  it.each([
    {
      label: 'wrong route',
      request: () => new Request('https://notes.example.test/other'),
      status: 404,
    },
    {
      label: 'query-bearing route',
      request: () => new Request('https://notes.example.test/mcp?function=other'),
      status: 404,
    },
    {
      label: 'encoded body',
      request: () =>
        new Request(resource, {
          method: 'POST',
          headers: { 'content-encoding': 'gzip' },
          body: 'encoded',
        }),
      status: 415,
    },
    {
      label: 'browser origin',
      request: () =>
        new Request(resource, {
          headers: { origin: 'https://attacker.example' },
          method: 'POST',
        }),
      status: 403,
    },
  ])('rejects $label before credential or application handling', async ({ request, status }) => {
    let verifierCalls = 0
    let factoryCalls = 0
    const handler = createConvexMcpHandler({
      resource,
      verifier: {
        async verifyAccessToken() {
          verifierCalls += 1
          return accessVerifier().verifyAccessToken(bearer, resource)
        },
      },
      oauthMetadata,
      createServer() {
        factoryCalls += 1
        return new McpServer({ name: 'must-not-run', version: '0.1.0' })
      },
    })
    const response = await handler.fetch({}, request())
    expect(response.status).toBe(status)
    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(response.text()).resolves.toBe('')
    expect(verifierCalls).toBe(0)
    expect(factoryCalls).toBe(0)
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
      new Request(resource, {
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
        oauthMetadata: {
          ...oauthMetadata,
          issuer: 'http://issuer.example.test/',
        },
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
        headers: {
          authorization: `Bearer ${bearer}`,
          'content-type': 'application/json',
        },
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
    for (const [request, expectedStatus] of [
      [
        new Request(`${resource.href}?access_token=${bearer}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        }),
        404,
      ],
      [
        new Request(resource, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ access_token: bearer }),
        }),
        401,
      ],
    ] as const) {
      const response = await headerOnlyHandler.fetch({}, request)
      expect(response.status).toBe(expectedStatus)
      expect(await response.text()).not.toContain(bearer)
    }
    expect(factoryCalls).toBe(0)
  })

  it('enforces request bounds before protocol parsing or application construction', async () => {
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
        body: 'a'.repeat(maximumMcpRequestBytes + 1),
        headers: {
          authorization: `Bearer ${bearer}`,
          'content-type': 'application/json',
        },
        method: 'POST',
      }),
    )

    expect(response.status).toBe(413)
    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(response.text()).resolves.toBe('')
    expect(factoryCalls).toBe(0)
  })

  it('returns an opaque timeout when the official handler cannot settle', async () => {
    vi.useFakeTimers()
    try {
      let factoryCalls = 0
      const handler = createConvexMcpHandler({
        resource,
        verifier: accessVerifier(),
        oauthMetadata,
        async createServer() {
          factoryCalls += 1
          return await new Promise<McpServer>(() => {})
        },
      })
      const pending = handler.fetch(
        {},
        new Request(resource, {
          body: JSON.stringify({
            id: 1,
            jsonrpc: '2.0',
            method: 'initialize',
            params: {
              capabilities: {},
              clientInfo: { name: 'timeout-client', version: '0.1.0' },
              protocolVersion: '2025-11-25',
            },
          }),
          headers: {
            authorization: `Bearer ${bearer}`,
            'content-type': 'application/json',
          },
          method: 'POST',
        }),
      )
      const responsePromise = expect(pending).resolves.toMatchObject({
        status: 504,
      })
      await vi.advanceTimersByTimeAsync(mcpRequestTimeoutMs)
      await responsePromise
      const response = await pending
      expect(response.headers.get('cache-control')).toBe('no-store')
      await expect(response.text()).resolves.toBe('')
      expect(factoryCalls).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('composes tool quotas from verified identity and host-trusted context without reading IP headers', async () => {
    let now = 0
    const windows = new Map<string, { count: number; startedAt: number }>()
    const identities = new Map([
      ['alice-client-1', { subject: 'alice', clientId: 'client-1' }],
      ['alice-client-2', { subject: 'alice', clientId: 'client-2' }],
      ['bob-client-1', { subject: 'bob', clientId: 'client-1' }],
    ])
    const verifier: McpAccessVerifier = {
      async verifyAccessToken(token) {
        const identity = identities.get(token)
        if (!identity) throw new Error('invalid')
        return {
          access: {
            issuer: oauthMetadata.issuer,
            subject: identity.subject,
            clientId: identity.clientId,
            resource: resource.href,
            scopes: ['notes:read', 'notes:write'],
          },
          expiresAt: Math.floor(Date.now() / 1_000) + 300,
        }
      },
    }
    const handler = createConvexMcpHandler<{
      readonly trustedNetworkKey: string
    }>({
      resource,
      verifier,
      oauthMetadata,
      createServer(context, access) {
        const server = new McpServer({ name: 'quota-proof', version: '0.1.0' })
        for (const tool of ['search_notes', 'rename_note'] as const) {
          server.registerTool(tool, { inputSchema: z.object({}) }, () => {
            const key = [
              access.resource,
              access.issuer,
              access.subject,
              access.clientId,
              tool,
              context.trustedNetworkKey,
            ].join('\u0000')
            const existing = windows.get(key)
            if (!existing || now - existing.startedAt >= 10_000) {
              windows.set(key, { count: 1, startedAt: now })
              return { content: [{ type: 'text', text: 'allowed' }] }
            }
            if (existing.count >= 1) {
              return {
                content: [{ type: 'text', text: 'rate limited' }],
                isError: true,
              }
            }
            existing.count += 1
            return { content: [{ type: 'text', text: 'allowed' }] }
          })
        }
        return server
      },
    })

    const call = async (
      token: string,
      trustedNetworkKey: string,
      tool: 'search_notes' | 'rename_note',
      spoofedIp = '203.0.113.1',
    ) => {
      const transport = new StreamableHTTPClientTransport(resource, {
        requestInit: {
          headers: {
            authorization: `Bearer ${token}`,
            'x-forwarded-for': spoofedIp,
          },
        },
        fetch: async (input, init) =>
          await handler.fetch({ trustedNetworkKey }, new Request(input, init)),
      })
      const client = new Client(
        { name: 'quota-client', version: '0.1.0' },
        { versionNegotiation: { mode: { pin: '2026-07-28' } } },
      )
      try {
        await client.connect(transport)
        return await client.callTool({ name: tool, arguments: {} })
      } finally {
        await client.close()
      }
    }

    expect((await call('alice-client-1', 'edge-a', 'search_notes')).isError).not.toBe(true)
    expect((await call('alice-client-1', 'edge-a', 'search_notes', '198.51.100.99')).isError).toBe(
      true,
    )
    expect((await call('alice-client-1', 'edge-a', 'rename_note')).isError).not.toBe(true)
    expect((await call('alice-client-2', 'edge-a', 'search_notes')).isError).not.toBe(true)
    expect((await call('bob-client-1', 'edge-a', 'search_notes')).isError).not.toBe(true)
    expect((await call('alice-client-1', 'edge-b', 'search_notes')).isError).not.toBe(true)

    now = 10_000
    expect((await call('alice-client-1', 'edge-a', 'search_notes')).isError).not.toBe(true)
    const concurrent = await Promise.all([
      call('alice-client-1', 'edge-a', 'rename_note'),
      call('alice-client-1', 'edge-a', 'rename_note'),
    ])
    expect(concurrent.filter((result) => result.isError === true)).toHaveLength(1)
  })
})
