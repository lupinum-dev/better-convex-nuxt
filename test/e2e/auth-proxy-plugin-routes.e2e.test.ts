import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { fileURLToPath } from 'node:url'

import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { afterAll, describe, expect, it } from 'vitest'

type CapturedRequest = {
  body: string
  headers: IncomingMessage['headers']
  method: string | undefined
  url: string | undefined
}

const capturedRequests: CapturedRequest[] = []

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk: string) => {
      body += chunk
    })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

async function startAuthUpstream() {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const body = await readRequestBody(req)
    capturedRequests.push({
      body,
      headers: req.headers,
      method: req.method,
      url: req.url,
    })

    res.statusCode = 201
    res.setHeader('content-type', 'application/json')
    res.setHeader('set-cookie', 'better-auth.session_token=plugin-route; Path=/; HttpOnly')
    res.end(JSON.stringify({ ok: true, route: req.url }))
  })

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Failed to start auth upstream')
  }

  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
  }
}

const upstream = await startAuthUpstream()

describe('auth proxy plugin routes', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../fixtures/basic', import.meta.url)),
    nuxtConfig: {
      convex: {
        url: 'https://demo.convex.cloud',
        siteUrl: upstream.url,
      },
    },
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      upstream.server.close((error) => {
        if (error) reject(error)
        else resolve()
      })
    })
  })

  it('forwards schema-changing Better Auth plugin routes without special-casing core auth endpoints', async () => {
    const response = await $fetch('/api/auth/organization/create?source=e2e', {
      method: 'POST',
      body: {
        name: 'Trellis Labs',
        slug: 'trellis-labs',
      },
      headers: {
        cookie: 'better-auth.session_token=e2e-session; private_app_cookie=secret',
      },
    })

    expect(response).toEqual({
      ok: true,
      route: '/api/auth/organization/create?source=e2e',
    })

    const request = capturedRequests.at(-1)
    expect(request).toMatchObject({
      method: 'POST',
      url: '/api/auth/organization/create?source=e2e',
    })
    expect(request?.headers.cookie).toContain('better-auth.session_token=e2e-session')
    expect(request?.headers.cookie).not.toContain('private_app_cookie')
    expect(JSON.parse(request?.body || '{}')).toEqual({
      name: 'Trellis Labs',
      slug: 'trellis-labs',
    })
  })
})
