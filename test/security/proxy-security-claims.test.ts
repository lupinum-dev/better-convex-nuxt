import { once } from 'node:events'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

import { createClient } from '@convex-dev/better-auth'
import { httpRouter } from 'convex/server'
import type { H3Event } from 'h3'
import { afterEach, describe, expect, it } from 'vitest'

import {
  readRequestBodyWithLimit,
  readResponseBodyWithLimit,
} from '../../src/runtime/server/api/auth/body-size'
import { buildAuthProxyForwardHeaders } from '../../src/runtime/server/api/auth/headers'
import {
  fetchWithCanonicalRedirects,
  getCanonicalRedirectTarget,
} from '../../src/runtime/server/api/auth/redirect-utils'
import { fetchWithTimeout } from '../../src/runtime/server/utils/http'

interface RunningServer {
  origin: string
  server: Server
}

interface ReceivedRequest {
  body: string
  headers: IncomingMessage['headers']
  method: string | undefined
  url: string | undefined
}

const runningServers = new Set<Server>()

async function startServer(
  listener: (request: IncomingMessage, response: ServerResponse) => Promise<void> | void,
): Promise<RunningServer> {
  const server = createServer((request, response) => {
    void Promise.resolve(listener(request, response)).catch((error: unknown) => {
      response.statusCode = 500
      response.end(error instanceof Error ? error.message : 'server experiment failed')
    })
  })
  runningServers.add(server)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Expected a TCP address for the experiment server')
  }

  return {
    origin: `http://127.0.0.1:${address.port}`,
    server,
  }
}

async function readIncomingRequest(request: IncomingMessage): Promise<ReceivedRequest> {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return {
    body: Buffer.concat(chunks).toString('utf8'),
    headers: request.headers,
    method: request.method,
    url: request.url,
  }
}

function streamFromBytes(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
}

function buildForwardHeaders(
  headers: HeadersInit,
  requestUrl = new URL('https://app.example.com/api/auth/test'),
): Record<string, string> {
  const event = { headers: new Headers(headers) } as unknown as H3Event
  return buildAuthProxyForwardHeaders(event, {
    requestUrl,
    originalHost: event.headers.get('host'),
  })
}

afterEach(async () => {
  const servers = [...runningServers]
  runningServers.clear()
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve())
          server.closeAllConnections()
        }),
    ),
  )
})

describe('Better Auth proxy security claim characterization', () => {
  it.each([
    [
      'HTTPS-to-HTTP downgrade',
      'https://auth.example.com/api/auth/sign-in/email?next=%2F',
      'http://auth.example.com/api/auth/sign-in/email?next=%2F',
    ],
    [
      'private-network destination',
      'https://auth.example.com/api/auth/sign-in/email?next=%2F',
      'http://127.0.0.1:8080/api/auth/sign-in/email?next=%2F',
    ],
  ])('accepts a same-path/query %s as canonical', (_label, from, to) => {
    expect(getCanonicalRedirectTarget(from, to)).toBe(to)
  })

  describe.each([301, 302, 307, 308] as const)('cross-origin HTTP %i', (statusCode) => {
    it('replays a credential-bearing POST body when path and query are unchanged', async () => {
      let receivedAtRedirectTarget: ReceivedRequest | undefined
      const redirectTarget = await startServer(async (request, response) => {
        receivedAtRedirectTarget = await readIncomingRequest(request)
        response.end('redirect target reached')
      })
      const firstHop = await startServer(async (request, response) => {
        await readIncomingRequest(request)
        response.writeHead(statusCode, {
          location: `${redirectTarget.origin}${request.url}`,
        })
        response.end('canonical redirect')
      })

      const credentials = JSON.stringify({
        email: 'owner@example.com',
        password: 'correct horse battery staple',
        token: 'reset-token-from-body',
      })
      const result = await fetchWithCanonicalRedirects({
        target: `${firstHop.origin}/api/auth/sign-in/email?returnTo=%2Fprivate`,
        method: 'POST',
        headers: {
          authorization: 'Bearer header-secret',
          cookie: 'better-auth.session_token=cookie-secret',
          'content-type': 'application/json',
        },
        body: credentials,
        timeoutMs: 2_000,
      })

      expect(result.followedCanonicalRedirect).toBe(true)
      expect(result.response.status).toBe(200)
      expect(receivedAtRedirectTarget).toMatchObject({
        body: credentials,
        method: 'POST',
        url: '/api/auth/sign-in/email?returnTo=%2Fprivate',
      })
      expect(receivedAtRedirectTarget?.headers.cookie).toBeUndefined()
      expect(receivedAtRedirectTarget?.headers.authorization).toBeUndefined()
      expect(receivedAtRedirectTarget?.headers['content-type']).toBe('application/json')
    })
  })

  it('passes attacker-supplied Better Auth marker headers through and the installed Convex adapter restores them', async () => {
    const forwardedByNuxt = buildForwardHeaders({
      host: 'app.example.com',
      'x-better-auth-forwarded-host': 'attacker.example',
      'x-better-auth-forwarded-proto': 'http',
    })

    // The immediate proxy metadata is authoritative, but the attacker marker survives beside it.
    expect(forwardedByNuxt['x-forwarded-host']).toBe('app.example.com')
    expect(forwardedByNuxt['x-forwarded-proto']).toBe('https')
    expect(forwardedByNuxt['x-better-auth-forwarded-host']).toBe('attacker.example')
    expect(forwardedByNuxt['x-better-auth-forwarded-proto']).toBe('http')

    let requestSeenByBetterAuth: Request | undefined
    const createAuth = () => ({
      handler: async (request: Request) => {
        requestSeenByBetterAuth = request
        return new Response('ok')
      },
      options: {
        trustedOrigins: ['https://app.example.com'],
      },
      $context: Promise.resolve({
        options: {
          trustedOrigins: ['https://app.example.com'],
        },
      }),
    })
    const component = {
      adapter: {
        create: 'create',
        findOne: 'findOne',
        findMany: 'findMany',
        updateOne: 'updateOne',
        updateMany: 'updateMany',
        deleteOne: 'deleteOne',
        deleteMany: 'deleteMany',
      },
    }
    const client = createClient(component as never)
    const router = httpRouter()
    client.registerRoutes(router, createAuth as never)

    const route = router.lookup('/api/auth/test', 'GET')
    if (!route) throw new Error('Expected the installed Convex adapter auth route')
    const handler = route[0] as unknown as {
      _handler: (ctx: unknown, request: Request) => Promise<Response>
    }
    await handler._handler(
      {},
      new Request('https://deployment.convex.site/api/auth/test', {
        headers: forwardedByNuxt,
      }),
    )

    expect(requestSeenByBetterAuth?.headers.get('x-forwarded-host')).toBe('attacker.example')
    expect(requestSeenByBetterAuth?.headers.get('x-forwarded-proto')).toBe('http')
  })

  it('passes an untrusted x-forwarded-for value through unchanged, enabling IP metadata spoofing unless ingress sanitizes it', () => {
    const forwarded = buildForwardHeaders({
      host: 'app.example.com',
      'x-forwarded-for': '203.0.113.77',
    })

    expect(forwarded['x-forwarded-for']).toBe('203.0.113.77')
  })

  it('turns invalid binary bytes into UTF-8 replacement bytes while preserving stale content-length, causing the real fetch to fail', async () => {
    const originalBytes = Uint8Array.of(255)
    const transformedBody = await readRequestBodyWithLimit(streamFromBytes(originalBytes), 16)
    if (!transformedBody) throw new Error('Expected the transformed request body')

    const forwarded = buildForwardHeaders({
      'content-length': String(originalBytes.byteLength),
      'content-type': 'application/octet-stream',
      host: 'app.example.com',
    })
    expect(forwarded['content-length']).toBe('1')
    expect(new TextEncoder().encode(transformedBody)).toEqual(Uint8Array.of(239, 191, 189))

    let receivedBytes = Buffer.alloc(0)
    const upstream = await startServer((request, response) => {
      request.on('data', (chunk: Buffer) => {
        receivedBytes = Buffer.concat([receivedBytes, chunk])
      })
      request.on('end', () => response.end('unexpected success'))
    })
    let observedError: unknown
    try {
      await fetchWithCanonicalRedirects({
        target: `${upstream.origin}/api/auth/plugin-binary`,
        method: 'POST',
        headers: forwarded,
        body: transformedBody,
        timeoutMs: 250,
      })
    } catch (error) {
      observedError = error
    }

    expect(observedError).toMatchObject({ message: 'Request timed out after 250ms' })
    // Undici does not complete a valid request: depending on when its framing
    // mismatch is detected, the server may receive no body or only the single
    // byte declared by Content-Length. It never receives the transformed body.
    expect(receivedBytes.byteLength).toBeLessThanOrEqual(originalBytes.byteLength)
    expect(receivedBytes).not.toEqual(Buffer.from([239, 191, 189]))
  })

  it('clears the timeout after response headers, so bounded body reading can remain pending past the configured deadline', async () => {
    let releaseResponseBody: (() => void) | undefined
    const upstream = await startServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/plain' })
      response.flushHeaders()
      releaseResponseBody = () => response.end('eventual body')
    })

    const timeoutMs = 200
    const response = await fetchWithTimeout(`${upstream.origin}/slow-body`, { timeoutMs })
    expect(response.status).toBe(200)

    const bodyPromise = readResponseBodyWithLimit(response, 1_024)
    const outcome = await Promise.race([
      bodyPromise.then(
        () => 'fulfilled',
        () => 'rejected',
      ),
      new Promise<'still-pending'>((resolve) => {
        setTimeout(() => resolve('still-pending'), timeoutMs + 50)
      }),
    ])

    expect(outcome).toBe('still-pending')
    if (!releaseResponseBody) throw new Error('Expected the upstream response release handle')
    releaseResponseBody()
    await expect(bodyPromise).resolves.toEqual(new TextEncoder().encode('eventual body'))
  })
})
