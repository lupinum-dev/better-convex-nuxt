import { describe, expect, it, vi } from 'vitest'

import {
  MCP_MAX_REQUEST_BODY_BYTES,
  buildMcpProxyRequestHeaders,
  buildMcpProxyResponseHeaders,
  proxyMcpRequest,
} from '../../src/runtime/server/mcp/proxy'
import {
  MCP_BETA_SCOPES,
  buildMcpBearerChallenge,
  buildMcpProtectedResourceMetadata,
  buildMcpTopology,
} from '../../src/runtime/server/mcp/topology'

const topology = buildMcpTopology('https://app.example.test', 'https://deployment.convex.site')

describe('fixed MCP topology and metadata', () => {
  it('derives every endpoint from trusted config', () => {
    expect(topology).toEqual({
      actionUrl: 'https://deployment.convex.site/mcp',
      issuer: 'https://app.example.test/api/auth',
      metadataUrl: 'https://app.example.test/.well-known/oauth-protected-resource/mcp',
      resource: 'https://app.example.test/mcp',
    })
  })

  it('publishes only the fixed bearer-header beta fields', () => {
    const metadata = buildMcpProtectedResourceMetadata(topology)
    expect(metadata).toEqual({
      resource: topology.resource,
      authorization_servers: [topology.issuer],
      scopes_supported: [...MCP_BETA_SCOPES],
      bearer_methods_supported: ['header'],
    })
    expect(JSON.stringify(metadata)).not.toMatch(/dpop|jwks|introspection|registration/i)
    expect(buildMcpBearerChallenge(topology)).toBe(
      'Bearer resource_metadata="https://app.example.test/.well-known/oauth-protected-resource/mcp"',
    )
    expect(buildMcpBearerChallenge(topology, 'mcp:write')).toBe(
      'Bearer resource_metadata="https://app.example.test/.well-known/oauth-protected-resource/mcp", scope="mcp:write"',
    )
  })
})

describe('bounded fixed-target MCP proxy', () => {
  it('keeps only protocol headers and the opaque Authorization value', () => {
    const authorization = 'Bearer opaque.value.never-parsed'
    const input = new Headers({
      accept: 'application/json, text/event-stream',
      authorization,
      connection: 'keep-alive, x-hop',
      cookie: 'better-auth.session_token=secret',
      forwarded: 'for=192.0.2.1;host=evil.test',
      host: 'evil.test',
      'mcp-protocol-version': '2025-11-25',
      'mcp-session-id': 'session-1',
      'proxy-authorization': 'Basic secret',
      'x-bcn-client-ip-signature': 'forged',
      'x-forwarded-host': 'evil.test',
      'x-hop': 'drop',
    })
    expect(Object.fromEntries(buildMcpProxyRequestHeaders(input))).toEqual({
      accept: 'application/json, text/event-stream',
      authorization,
      'mcp-protocol-version': '2025-11-25',
      'mcp-session-id': 'session-1',
    })
  })

  it('forwards only to the configured action and preserves direct decisions', async () => {
    const authorization = 'Bearer not-a-jwt-and-never-decoded-here'
    const challenge = buildMcpBearerChallenge(topology)
    const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe(topology.actionUrl)
      expect(init?.redirect).toBe('manual')
      expect(init?.method).toBe('POST')
      expect(new Headers(init?.headers).get('authorization')).toBe(authorization)
      expect(new Headers(init?.headers).get('cookie')).toBeNull()
      return Response.json(
        { code: 'MCP_INVALID_TOKEN' },
        { headers: { 'www-authenticate': challenge, 'x-internal': 'drop' }, status: 401 },
      )
    })
    const response = await proxyMcpRequest({
      fetch: fetch as typeof globalThis.fetch,
      request: new Request('https://attacker-controlled-host.invalid/mcp', {
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
        headers: {
          authorization,
          cookie: 'secret=must-not-forward',
          'content-type': 'application/json',
          'x-forwarded-host': 'evil.test',
        },
        method: 'POST',
      }),
      topology,
    })

    expect(fetch).toHaveBeenCalledOnce()
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe(challenge)
    expect(response.headers.get('x-internal')).toBeNull()
    await expect(response.json()).resolves.toEqual({ code: 'MCP_INVALID_TOKEN' })
  })

  it('rejects caller path/query selection, redirects, encoded bodies, and oversized bodies', async () => {
    const fetch = vi.fn(
      async () => new Response(null, { headers: { location: 'https://evil.test' }, status: 307 }),
    )
    const makePost = (url: string, body: string, headers: Record<string, string> = {}) =>
      new Request(url, {
        body,
        headers: { 'content-type': 'application/json', ...headers },
        method: 'POST',
      })

    expect(
      (
        await proxyMcpRequest({
          fetch: fetch as typeof globalThis.fetch,
          request: makePost('https://app.example.test/mcp?upstream=https://evil.test', '{}'),
          topology,
        })
      ).status,
    ).toBe(404)
    expect(
      (
        await proxyMcpRequest({
          fetch: fetch as typeof globalThis.fetch,
          request: makePost('https://app.example.test/mcp', '{}', {
            'content-encoding': 'gzip',
          }),
          topology,
        })
      ).status,
    ).toBe(415)
    expect(
      (
        await proxyMcpRequest({
          fetch: fetch as typeof globalThis.fetch,
          request: makePost(
            'https://app.example.test/mcp',
            'x'.repeat(MCP_MAX_REQUEST_BODY_BYTES + 1),
          ),
          topology,
        })
      ).status,
    ).toBe(413)

    const redirect = await proxyMcpRequest({
      fetch: fetch as typeof globalThis.fetch,
      request: makePost('https://app.example.test/mcp', '{}'),
      topology,
    })
    expect(redirect.status).toBe(502)
    await expect(redirect.json()).resolves.toEqual({
      code: 'BCN_MCP_UPSTREAM_REDIRECT_REJECTED',
    })
  })

  it('allows only the response protocol surface', () => {
    expect(
      Object.fromEntries(
        buildMcpProxyResponseHeaders(
          new Headers({
            'cache-control': 'no-store',
            'content-type': 'text/event-stream',
            cookie: 'never',
            'mcp-session-id': 'session-1',
            'set-cookie': 'never=1',
            'www-authenticate': buildMcpBearerChallenge(topology),
            'x-bcn-secret': 'never',
          }),
        ),
      ),
    ).toEqual({
      'cache-control': 'no-store',
      'content-type': 'text/event-stream',
      'mcp-session-id': 'session-1',
      'www-authenticate': buildMcpBearerChallenge(topology),
    })
  })

  it('maps malformed upstream length metadata to an upstream failure', async () => {
    const response = await proxyMcpRequest({
      fetch: (async () =>
        new Response('{}', {
          headers: {
            'content-length': 'not-a-decimal-length',
            'content-type': 'application/json',
          },
        })) as typeof globalThis.fetch,
      request: new Request('https://app.example.test/mcp', {
        body: '{}',
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }),
      topology,
    })

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({
      code: 'BCN_MCP_UPSTREAM_LENGTH_INVALID',
    })
  })
})
