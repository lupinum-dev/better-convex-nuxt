import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  MCP_FIXTURE_SCOPE,
  MCP_REMOTE_CALLBACK,
  assertNoJwtShapedValue,
  buildMcpRemoteArgs,
  buildMcpRemoteClientInfo,
  buildMcpRemoteClientMetadata,
  redactEvidenceLog,
} from '../../scripts/mcp-auth-contracts.mjs'
import {
  MCP_CONFORMANCE_OUTPUT,
  MCP_CONFORMANCE_ORIGIN,
  MCP_CONFORMANCE_SCENARIOS,
  MCP_CONFORMANCE_URL,
  MCP_RC_EXPECTED_CAPABILITIES,
  MCP_RC_PROTOCOL_VERSION,
  buildConformanceArgs,
  buildRelayRequestHeaders,
  buildRelayResponseHeaders,
  countFailedChecks,
  isRedirectResponse,
  normalizeEvidenceOrigin,
  relayAuthorityError,
  runRcProtocolConformance,
} from '../../scripts/run-mcp-conformance.mjs'

describe('pinned MCP client runner contracts', () => {
  it('uses the exact static mcp-remote public-client files and argv', () => {
    expect(buildMcpRemoteClientInfo('provider-generated-client-id')).toEqual({
      client_id: 'provider-generated-client-id',
    })
    expect(() => buildMcpRemoteClientInfo('')).toThrow(/client ID/)
    expect(buildMcpRemoteClientMetadata()).toEqual({
      redirect_uris: [MCP_REMOTE_CALLBACK],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code'],
      response_types: ['code'],
      scope: MCP_FIXTURE_SCOPE,
    })
    const args = buildMcpRemoteArgs(
      'https://app.example.test/mcp',
      '/tmp/info.json',
      '/tmp/metadata.json',
    )
    expect(args).toEqual([
      'exec',
      'mcp-remote',
      'https://app.example.test/mcp',
      '3334',
      '--host',
      '127.0.0.1',
      '--transport',
      'http-only',
      '--resource',
      'https://app.example.test/mcp',
      '--auth-timeout',
      '60',
      '--static-oauth-client-info',
      '@/tmp/info.json',
      '--static-oauth-client-metadata',
      '@/tmp/metadata.json',
    ])
    expect(args).not.toContain('--debug')
  })

  it('redacts exact secrets and URL query state before emitting child logs', () => {
    const output = redactEvidenceLog(
      'token-secret https://issuer.example/authorize?code=secret&state=secret',
      ['token-secret'],
    )
    expect(output).toBe('[REDACTED] https://issuer.example/authorize?[REDACTED_QUERY]')
    expect(output).not.toContain('secret')
  })

  it('fails closed when a captured client log contains a JWT-shaped value', () => {
    expect(() =>
      assertNoJwtShapedValue(
        'client log eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEifQ.signature-material-that-must-not-be-logged',
      ),
    ).toThrow(/JWT-shaped/)
    expect(() => assertNoJwtShapedValue('ordinary MCP client output')).not.toThrow()
  })
})

describe('official MCP conformance runner contracts', () => {
  it('constructs one exact command per advertised protocol scenario without a baseline', () => {
    expect(MCP_CONFORMANCE_SCENARIOS).toEqual(['server-initialize', 'ping', 'tools-list'])
    for (const scenario of MCP_CONFORMANCE_SCENARIOS) {
      const args = buildConformanceArgs(scenario)
      expect(args).toEqual([
        'exec',
        'conformance',
        'server',
        '--url',
        MCP_CONFORMANCE_URL,
        '--scenario',
        scenario,
        '--spec-version',
        '2025-11-25',
        '--output-dir',
        MCP_CONFORMANCE_OUTPUT,
      ])
      expect(args).not.toContain('--expected-failures')
      expect(args).not.toContain('--suite')
    }
    expect(() => buildConformanceArgs('tools-call-simple-text')).toThrow(/Unknown/)
  })

  it('proves the locked RC stateless envelope and exact advertised capability surface', async () => {
    const handler = createMcpHandler(
      () => {
        const server = new McpServer({ name: 'bcn-rc-conformance', version: '1.0.0' })
        server.registerTool(
          'search_notes',
          { inputSchema: z.object({ query: z.string().optional() }) },
          () => ({ content: [{ type: 'text', text: 'No notes matched.' }] }),
        )
        return server
      },
      { legacy: 'reject', responseMode: 'json' },
    )
    try {
      await expect(
        runRcProtocolConformance({
          bearer: 'rc-conformance-bearer',
          endpoint: 'https://notes.example.test/mcp',
          fetch: (input: RequestInfo | URL, init?: RequestInit) =>
            handler.fetch(new Request(input, init)),
        }),
      ).resolves.toEqual({
        capabilities: MCP_RC_EXPECTED_CAPABILITIES,
        protocolVersion: MCP_RC_PROTOCOL_VERSION,
        requests: 2,
        toolCount: 1,
      })
    } finally {
      await handler.close()
    }
  })

  it('accepts only exact secure or loopback fixture origins', () => {
    expect(normalizeEvidenceOrigin('https://app.example.test')).toBe('https://app.example.test')
    expect(normalizeEvidenceOrigin('http://127.0.0.1:3000')).toBe('http://127.0.0.1:3000')
    expect(() => normalizeEvidenceOrigin('http://app.example.test')).toThrow(/HTTPS/)
    expect(() => normalizeEvidenceOrigin('https://app.example.test/path')).toThrow(/only scheme/)
  })

  it('strips caller credentials and internal headers and injects only the runner bearer', () => {
    const input = new Headers({
      accept: 'application/json',
      authorization: 'Bearer caller-token',
      connection: 'keep-alive',
      cookie: 'session=caller',
      forwarded: 'for=evil',
      'mcp-protocol-version': '2025-11-25',
      'mcp-method': 'tools/list',
      'mcp-name': 'search_notes',
      'x-bcn-internal': 'evil',
      'x-forwarded-for': 'evil',
    })
    expect(Object.fromEntries(buildRelayRequestHeaders(input, 'runner-token'))).toEqual({
      accept: 'application/json',
      authorization: 'Bearer runner-token',
      'mcp-method': 'tools/list',
      'mcp-name': 'search_notes',
      'mcp-protocol-version': '2025-11-25',
    })
    expect(
      Object.fromEntries(
        buildRelayResponseHeaders(
          new Headers({
            'content-type': 'application/json',
            'mcp-session-id': 'session-1',
            'set-cookie': 'secret=1',
            'x-internal': 'secret',
          }),
        ),
      ),
    ).toEqual({ 'content-type': 'application/json', 'mcp-session-id': 'session-1' })
  })

  it('rejects DNS-rebinding Host and Origin values before bearer injection', () => {
    expect(relayAuthorityError(new Headers({ host: '127.0.0.1:7334' }))).toBeUndefined()
    expect(
      relayAuthorityError(new Headers({ host: '127.0.0.1:7334', origin: MCP_CONFORMANCE_ORIGIN })),
    ).toBeUndefined()
    expect(relayAuthorityError(new Headers({ host: 'evil.example' }))).toBe(
      'MCP_RELAY_INVALID_HOST',
    )
    expect(
      relayAuthorityError(new Headers({ host: '127.0.0.1:7334', origin: 'https://evil.example' })),
    ).toBe('MCP_RELAY_INVALID_ORIGIN')
    expect(relayAuthorityError(new Headers())).toBe('MCP_RELAY_INVALID_HOST')
  })

  it('recognizes official FAILURE checks recursively', () => {
    expect(countFailedChecks([{ status: 'SUCCESS' }, { nested: [{ status: 'FAILURE' }] }])).toBe(1)
  })

  it('rejects every HTTP redirect status', () => {
    expect(isRedirectResponse(299)).toBe(false)
    expect(isRedirectResponse(300)).toBe(true)
    expect(isRedirectResponse(399)).toBe(true)
    expect(isRedirectResponse(400)).toBe(false)
  })
})
