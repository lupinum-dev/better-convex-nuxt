import http from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { ConvexCallError } from '../../src/runtime/errors'
import { ServerConvexValidationError } from '../../src/runtime/server/utils/server-convex-options'
import {
  exchangeConvexToken,
  normalizeSiteUrl,
  readToken,
} from '../../src/runtime/server/utils/token-exchange'

// ---------------------------------------------------------------------------
// Loopback HTTP harness. We drive the real `exchangeConvexToken` -> global
// fetch path against a real node:http server on 127.0.0.1 (http loopback is
// permitted by normalizeSiteUrl).
// ---------------------------------------------------------------------------

interface RecordedRequest {
  method: string | undefined
  url: string | undefined
  cookie: string | undefined
  authorization: string | undefined
}

interface Harness {
  siteUrl: string
  requests: RecordedRequest[]
  close: () => Promise<void>
}

type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void

async function startServer(handler: Handler, requests: RecordedRequest[]): Promise<Harness> {
  const server = http.createServer((req, res) => {
    requests.push({
      method: req.method,
      url: req.url,
      cookie: req.headers['cookie'],
      authorization: req.headers['authorization'],
    })
    handler(req, res)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    siteUrl: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  }
}

const openHarnesses: Harness[] = []
async function harness(handler: Handler): Promise<Harness> {
  const requests: RecordedRequest[] = []
  const created = await startServer(handler, requests)
  openHarnesses.push(created)
  return created
}

afterEach(async () => {
  vi.restoreAllMocks()
  while (openHarnesses.length) {
    const created = openHarnesses.pop()
    if (created) await created.close()
  }
})

function jsonResponse(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

const COOKIE =
  'private_app_cookie=DO_NOT_FORWARD; better-auth.session_token=SUPERSECRET_SESSION_abc123'
const FORWARDED_COOKIE = 'better-auth.session_token=SUPERSECRET_SESSION_abc123'
const BEARER = 'BEARER_SECRET_xyz789'

describe('exchangeConvexToken — success', () => {
  it('exchanges a cookie credential and returns the token (GET /api/auth/convex/token)', async () => {
    const server = await harness((_req, res) => jsonResponse(res, 200, { token: 'jwt.cookie.ok' }))

    const result = await exchangeConvexToken({
      siteUrl: server.siteUrl,
      credential: { type: 'cookie', value: COOKIE },
    })

    expect(result).toEqual({ token: 'jwt.cookie.ok', status: 200, error: null })
    expect(server.requests).toHaveLength(1)
    expect(server.requests[0]!.method).toBe('GET')
    expect(server.requests[0]!.url).toBe('/api/auth/convex/token')
    expect(server.requests[0]!.cookie).toBe(FORWARDED_COOKIE)
    expect(server.requests[0]!.authorization).toBeUndefined()
  })

  it('exchanges a bearer credential and sends Authorization: Bearer', async () => {
    const server = await harness((_req, res) => jsonResponse(res, 200, { token: 'jwt.bearer.ok' }))

    const result = await exchangeConvexToken({
      siteUrl: server.siteUrl,
      credential: { type: 'bearer', value: BEARER },
    })

    expect(result.token).toBe('jwt.bearer.ok')
    expect(result.error).toBeNull()
    expect(server.requests[0]!.authorization).toBe(`Bearer ${BEARER}`)
    expect(server.requests[0]!.cookie).toBeUndefined()
  })
})

describe('exchangeConvexToken — HTTP failure classification', () => {
  it('cancels a non-ok response body before returning the HTTP outcome', async () => {
    const cancel = vi.fn()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new ReadableStream({ start() {}, cancel }), { status: 401 }),
    )

    const result = await exchangeConvexToken({
      siteUrl: 'https://demo.convex.site',
      credential: { type: 'cookie', value: COOKIE },
    })

    expect(result).toMatchObject({ token: null, status: 401 })
    expect(cancel).toHaveBeenCalledOnce()
  })

  it.each([401, 403])('classifies HTTP %s as authentication', async (status) => {
    const server = await harness((_req, res) => jsonResponse(res, status, { error: 'nope' }))

    const result = await exchangeConvexToken({
      siteUrl: server.siteUrl,
      credential: { type: 'cookie', value: COOKIE },
    })

    expect(result.token).toBeNull()
    expect(result.status).toBe(status)
    expect(result.error).toBeInstanceOf(ConvexCallError)
    expect(result.error!.kind).toBe('authentication')
    expect(result.error!.status).toBe(status)
  })

  it('classifies HTTP 500 as transport', async () => {
    const server = await harness((_req, res) => jsonResponse(res, 500, { error: 'boom' }))

    const result = await exchangeConvexToken({
      siteUrl: server.siteUrl,
      credential: { type: 'cookie', value: COOKIE },
    })

    expect(result.token).toBeNull()
    expect(result.status).toBe(500)
    expect(result.error!.kind).toBe('transport')
  })

  it('classifies a missing token (200, no token field) as transport', async () => {
    const server = await harness((_req, res) => jsonResponse(res, 200, { notAToken: true }))

    const result = await exchangeConvexToken({
      siteUrl: server.siteUrl,
      credential: { type: 'cookie', value: COOKIE },
    })

    expect(result.token).toBeNull()
    expect(result.status).toBe(200)
    expect(result.error!.kind).toBe('transport')
    expect(result.error!.message).toMatch(/did not include a token/)
  })

  it('classifies malformed JSON as transport', async () => {
    const server = await harness((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('{ this is not json ]')
    })

    const result = await exchangeConvexToken({
      siteUrl: server.siteUrl,
      credential: { type: 'cookie', value: COOKIE },
    })

    expect(result.token).toBeNull()
    expect(result.status).toBeUndefined()
    expect(result.error!.kind).toBe('transport')
  })

  it('classifies an oversized response as transport and drains it', async () => {
    const server = await harness((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      // ~4 MiB, over the 1 MiB bound.
      res.end('{"token":"' + 'A'.repeat(4 * 1_048_576) + '"}')
    })

    const result = await exchangeConvexToken({
      siteUrl: server.siteUrl,
      credential: { type: 'cookie', value: COOKIE },
    })

    expect(result.token).toBeNull()
    expect(result.error!.kind).toBe('transport')
  })

  it('classifies a timeout as transport', async () => {
    const server = await harness((_req, res) => {
      // Never respond within the timeout window.
      setTimeout(() => jsonResponse(res, 200, { token: 'late' }), 1_000)
    })

    const result = await exchangeConvexToken({
      siteUrl: server.siteUrl,
      credential: { type: 'cookie', value: COOKIE },
      timeoutMs: 50,
    })

    expect(result.token).toBeNull()
    expect(result.status).toBeUndefined()
    expect(result.error!.kind).toBe('transport')
  })

  it('classifies a fetch failure (connection refused) as transport', async () => {
    // A closed loopback port: normalizeSiteUrl accepts it, fetch fails.
    const result = await exchangeConvexToken({
      siteUrl: 'http://127.0.0.1:1',
      credential: { type: 'cookie', value: COOKIE },
    })

    expect(result.token).toBeNull()
    expect(result.status).toBeUndefined()
    expect(result.error!.kind).toBe('transport')
  })
})

describe('exchangeConvexToken — redirect safety (zero credential delivery)', () => {
  it.each([301, 302, 307, 308])(
    'never delivers the credential to a cross-origin %s redirect target',
    async (status) => {
      const recorder = await harness((_req, res) => res.end('recorder'))

      const upstream = await harness((_req, res) => {
        res.writeHead(status, { Location: `${recorder.siteUrl}/recorder` })
        res.end('redirecting')
      })

      const result = await exchangeConvexToken({
        siteUrl: upstream.siteUrl,
        credential: { type: 'cookie', value: COOKIE },
      })

      // Exchange did not throw; it returned a transport error.
      expect(result.token).toBeNull()
      expect(result.error!.kind).toBe('transport')
      // The legit first hop happened exactly once.
      expect(upstream.requests).toHaveLength(1)
      // The redirect target received ZERO requests — the credential never left
      // the first origin.
      expect(recorder.requests).toHaveLength(0)
    },
  )

  it('never delivers the credential to a same-origin redirect target', async () => {
    let sawCredentialOnRecorder = false
    const server = await harness((req, res) => {
      const path = (req.url ?? '').split('?')[0]
      if (path === '/api/auth/convex/token') {
        // Redirect to a same-origin recorder path.
        res.writeHead(302, { Location: `/recorder` })
        res.end('redirecting')
        return
      }
      if (path === '/recorder') {
        if (req.headers['cookie'] || req.headers['authorization']) sawCredentialOnRecorder = true
        res.end('recorder')
        return
      }
      res.writeHead(404).end('nf')
    })

    const result = await exchangeConvexToken({
      siteUrl: server.siteUrl,
      credential: { type: 'cookie', value: COOKIE },
    })

    expect(result.error!.kind).toBe('transport')
    // Only the token endpoint was hit; the /recorder path never received the
    // credential (redirect:'error' rejects before following).
    expect(sawCredentialOnRecorder).toBe(false)
    expect(server.requests.filter((r) => (r.url ?? '').startsWith('/recorder'))).toHaveLength(0)
  })
})

describe('exchangeConvexToken — synchronous credential validation (before network)', () => {
  const CONTROL_CASES: Array<[string, string]> = [
    ['CRLF', `session=abc${String.fromCharCode(13, 10)}Host: evil.example`],
    ['bare-LF', `session=abc${String.fromCharCode(10)}def`],
    ['bare-CR', `session=abc${String.fromCharCode(13)}def`],
    ['NUL', `session=abc${String.fromCharCode(0)}def`],
    ['DEL', `session=abc${String.fromCharCode(127)}def`],
    ['TAB', `session=abc${String.fromCharCode(9)}def`],
  ]

  it.each(CONTROL_CASES)(
    'rejects a %s control-character credential before any network access',
    async (_label, value) => {
      const server = await harness((_req, res) => jsonResponse(res, 200, { token: 'nope' }))

      expect(() =>
        exchangeConvexToken({ siteUrl: server.siteUrl, credential: { type: 'cookie', value } }),
      ).toThrow(ServerConvexValidationError)

      // The token endpoint was never contacted.
      expect(server.requests).toHaveLength(0)
    },
  )

  it('rejects an empty credential before any network access', async () => {
    const server = await harness((_req, res) => jsonResponse(res, 200, { token: 'nope' }))

    expect(() =>
      exchangeConvexToken({ siteUrl: server.siteUrl, credential: { type: 'cookie', value: '' } }),
    ).toThrow(ServerConvexValidationError)

    expect(server.requests).toHaveLength(0)
  })

  it('rejects a malformed credential shape before any network access', async () => {
    const server = await harness((_req, res) => jsonResponse(res, 200, { token: 'nope' }))

    expect(() =>
      exchangeConvexToken({
        siteUrl: server.siteUrl,
        // @ts-expect-error direct JavaScript callers still require runtime validation
        credential: { type: 'basic', value: 'credential' },
      }),
    ).toThrow('credential must be a cookie or bearer credential')

    expect(server.requests).toHaveLength(0)
  })

  it('rejects a cookie credential without a supported session cookie before network access', async () => {
    const server = await harness((_req, res) => jsonResponse(res, 200, { token: 'nope' }))

    expect(() =>
      exchangeConvexToken({
        siteUrl: server.siteUrl,
        credential: { type: 'cookie', value: 'private_app_cookie=DO_NOT_FORWARD' },
      }),
    ).toThrow('credential must contain a non-empty supported Better Auth session cookie')

    expect(server.requests).toHaveLength(0)
  })
})

describe('normalizeSiteUrl — origin and loopback rules', () => {
  const ACCEPT: Array<[string, string]> = [
    ['https://example.convex.site', 'https://example.convex.site'],
    ['http://localhost:3000', 'http://localhost:3000'],
    ['http://app.localhost:3000', 'http://app.localhost:3000'],
    ['http://127.0.0.1:3210', 'http://127.0.0.1:3210'],
    ['http://127.5.6.7', 'http://127.5.6.7'],
    ['http://127.255.255.255', 'http://127.255.255.255'], // top of 127.0.0.0/8
    ['http://[::1]:3000', 'http://[::1]:3000'],
  ]

  it.each(ACCEPT)('accepts %s', (input, origin) => {
    expect(normalizeSiteUrl(input)).toBe(origin)
  })

  const REJECT: string[] = [
    'http://example.convex.site', // http non-loopback
    'http://192.168.1.10', // private non-loopback
    'http://128.0.0.1', // just outside 127.0.0.0/8
    'http://256.0.0.1', // not a valid loopback octet, non-loopback host
    'https://user:pass@example.convex.site', // embedded credentials
    'https://example.convex.site/api/auth', // non-root path
    'https://example.convex.site/?x=1', // query string
    'https://example.convex.site/#frag', // fragment
    'ftp://example.convex.site', // non-http(s) scheme
    'not-a-url',
  ]

  it.each(REJECT)('rejects %s', (input) => {
    expect(() => normalizeSiteUrl(input)).toThrow(ServerConvexValidationError)
  })
})

describe('readToken', () => {
  it('extracts a non-empty string token', () => {
    expect(readToken({ token: 'abc' })).toBe('abc')
  })
  it('returns null for empty/missing/non-string token', () => {
    expect(readToken({ token: '' })).toBeNull()
    expect(readToken({})).toBeNull()
    expect(readToken({ token: 123 })).toBeNull()
    expect(readToken(null)).toBeNull()
    expect(readToken('str')).toBeNull()
  })
})

describe('exchangeConvexToken — secrets never appear in logs', () => {
  it('does not leak the credential through console at any level on failure', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => {}),
    )
    const server = await harness((_req, res) => jsonResponse(res, 500, { error: 'boom' }))

    const result = await exchangeConvexToken({
      siteUrl: server.siteUrl,
      credential: { type: 'cookie', value: COOKIE },
    })
    // Also force the error through a console channel to confirm the redacted
    // inspect shape holds even when someone logs it directly.
    console.error(result.error)

    const captured = spies
      .flatMap((spy) => spy.mock.calls)
      .map((args) => args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
      .join('\n')

    expect(captured).not.toContain('SUPERSECRET_SESSION_abc123')
  })
})
