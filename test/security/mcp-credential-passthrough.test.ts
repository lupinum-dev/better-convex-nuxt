import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { McpServer } from '@modelcontextprotocol/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { createConvexMcpHandler } from '../../packages/mcp/src/handler'
import type { McpAccessVerifier } from '../../packages/mcp/src/index'
import { runMcpTool } from '../../packages/mcp/src/tools'

const resource = new URL('https://absence.example.test/mcp')
const bearer = 'unique-raw-bearer-4f74c5c8'
const providerReference = 'unique-provider-reference-93bd5701'
const oauthMetadata = {
  authorization_endpoint: 'https://issuer.example.test/authorize',
  code_challenge_methods_supported: ['S256'],
  grant_types_supported: ['authorization_code'],
  issuer: 'https://issuer.example.test/',
  response_types_supported: ['code'],
  token_endpoint: 'https://issuer.example.test/token',
  token_endpoint_auth_methods_supported: ['none'],
}

afterEach(() => vi.restoreAllMocks())

describe('MCP credential passthrough absence', () => {
  it('terminates raw credential state before application arguments, results, diagnostics, and logs', async () => {
    const consoleSpies = [
      vi.spyOn(console, 'debug').mockImplementation(() => undefined),
      vi.spyOn(console, 'error').mockImplementation(() => undefined),
      vi.spyOn(console, 'info').mockImplementation(() => undefined),
      vi.spyOn(console, 'log').mockImplementation(() => undefined),
      vi.spyOn(console, 'warn').mockImplementation(() => undefined),
    ]
    const verifier: McpAccessVerifier = {
      async verifyAccessToken(token, expectedResource) {
        if (
          token !== bearer ||
          expectedResource.href !== resource.href ||
          providerReference.length === 0
        ) {
          throw new Error('invalid')
        }
        return {
          access: {
            issuer: oauthMetadata.issuer,
            subject: 'credential-123',
            clientId: 'client-123',
            resource: resource.href,
            scopes: ['notes:read'],
          },
          expiresAt: Math.floor(Date.now() / 1_000) + 300,
        }
      },
    }
    const operationArguments: unknown[] = []
    const diagnostics: unknown[] = []
    const responseBodies: string[] = []
    const callbackHeaders: Headers[] = []
    const handler = createConvexMcpHandler({
      resource,
      verifier,
      authorization: { mode: 'oauth', metadata: oauthMetadata },
      createServer(_context, access) {
        const server = new McpServer({
          name: 'absence-proof',
          version: '0.1.0',
        })
        server.registerTool(
          'search_notes',
          {
            inputSchema: z.object({ query: z.string() }).strict(),
            outputSchema: z.object({ matches: z.array(z.string()) }).strict(),
          },
          async (input, extra) => {
            if (extra.http?.req) callbackHeaders.push(new Headers(extra.http.req.headers))
            const args = {
              actor: { issuer: access.issuer, subject: access.subject },
              input,
            }
            operationArguments.push(args)
            return {
              content: [{ type: 'text', text: 'No notes matched.' }],
              structuredContent: { matches: [] },
            }
          },
        )
        server.registerTool(
          'fail_safely',
          { inputSchema: z.object({}).strict() },
          (_input, extra) => {
            if (extra.http?.req) callbackHeaders.push(new Headers(extra.http.req.headers))
            return runMcpTool(
              () => {
                throw new Error(`${bearer}:${providerReference}`)
              },
              {
                operation: 'action',
                toolName: 'fail_safely',
                functionName: 'notes:failSafely',
                onDiagnostic(diagnostic) {
                  diagnostics.push(diagnostic)
                },
              },
            )
          },
        )
        return server
      },
    })
    const transport = new StreamableHTTPClientTransport(resource, {
      requestInit: {
        headers: {
          authorization: `Bearer ${bearer}`,
          cookie: 'session=unique-cookie-credential-sentinel',
          'proxy-authorization': 'Basic unique-proxy-credential-sentinel',
          'x-forwarded-authorization': 'unique-forwarded-credential-sentinel',
        },
      },
      fetch: async (input, init) => {
        const response = await handler.fetch({}, new Request(input, init))
        responseBodies.push(await response.clone().text())
        return response
      },
    })
    const client = new Client(
      { name: 'absence-client', version: '0.1.0' },
      { versionNegotiation: { mode: { pin: '2026-07-28' } } },
    )

    try {
      await client.connect(transport)
      const success = await client.callTool({
        name: 'search_notes',
        arguments: { query: 'alpha' },
      })
      expect(success).toMatchObject({
        content: [{ type: 'text', text: 'No notes matched.' }],
        structuredContent: { matches: [] },
      })
      const failure = await client.callTool({
        name: 'fail_safely',
        arguments: {},
      })
      expect(failure).toMatchObject({
        content: [{ type: 'text', text: 'Tool execution failed' }],
        isError: true,
      })
    } finally {
      await client.close()
    }

    expect(operationArguments).toEqual([
      {
        actor: { issuer: oauthMetadata.issuer, subject: 'credential-123' },
        input: { query: 'alpha' },
      },
    ])
    expect(diagnostics).toEqual([
      {
        callId: expect.stringMatching(/^[0-9a-f-]{36}$/u),
        causeConstructorName: 'Error',
        causeName: 'Error',
        classification: 'unknown',
        functionName: 'notes:failSafely',
        hasStructuredData: false,
        operation: 'action',
        outcome: 'failed',
        toolName: 'fail_safely',
      },
    ])
    expect(callbackHeaders).toHaveLength(2)
    for (const headers of callbackHeaders) {
      expect(headers.get('authorization')).toBeNull()
      expect(headers.get('cookie')).toBeNull()
      expect(headers.get('proxy-authorization')).toBeNull()
      expect(headers.get('x-forwarded-authorization')).toBeNull()
      expect(headers.get('content-type')).toContain('application/json')
    }
    const observable = JSON.stringify({
      callbackHeaders: callbackHeaders.map((headers) => Object.fromEntries(headers)),
      diagnostics,
      operationArguments,
      responseBodies,
    })
    expect(observable).not.toContain(bearer)
    expect(observable).not.toContain(providerReference)
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled()
  })
})
