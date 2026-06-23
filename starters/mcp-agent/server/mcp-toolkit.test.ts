import { readFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import { fileURLToPath } from 'node:url'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { $fetch, setup, url } from '@nuxt/test-utils/e2e'
import { afterAll, afterEach, describe, expect, it } from 'vitest'

import { hashBearerSecret } from './utils/mcpProjectTools'

type ConvexRequest = {
  endpoint: string
  path: string
  args: unknown[]
}

const convexRequests: ConvexRequest[] = []
const proofToken = 'proof-token'
const proofTokenHash = hashBearerSecret(proofToken)

async function readRequestBody(request: IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function startFakeConvexServer() {
  const server = createServer(async (request, response) => {
    if (request.method !== 'POST' || !request.url?.startsWith('/api/')) {
      response.writeHead(404, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ status: 'error', errorMessage: 'not found' }))
      return
    }

    const body = JSON.parse(await readRequestBody(request)) as {
      path: string
      args: unknown[]
    }
    convexRequests.push({
      endpoint: request.url,
      path: body.path,
      args: body.args,
    })

    const value = request.url === '/api/query'
      ? [
          {
            _id: 'project-1',
            organizationId: 'org-1',
            name: 'Launch',
            createdBy: { kind: 'serviceActor', serviceActorId: 'actor-1' },
            createdAt: 1,
          },
        ]
      : 'project-2'

    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ status: 'success', value }))
  })

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Failed to start fake Convex server')
  }

  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
  }
}

function mcpUrl() {
  return new URL('/mcp', url('/'))
}

function readSource(path: string) {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
}

async function createClient(token = proofToken, authorizationHeader?: string) {
  const client = new Client({
    name: 'mcp-agent-test',
    version: '1.0.0',
  })

  const headers = authorizationHeader
    ? { authorization: authorizationHeader }
    : token
      ? {
          authorization: `Bearer ${token}`,
        }
      : undefined

  await client.connect(
    new StreamableHTTPClientTransport(mcpUrl(), {
      requestInit: {
        headers,
      },
    }),
  )

  return client
}

describe('Nuxt MCP Toolkit transport', async () => {
  const fakeConvex: { server: Server; url: string } = await startFakeConvexServer()
  process.env.NUXT_PUBLIC_CONVEX_URL = fakeConvex.url

  await setup({
    rootDir: fileURLToPath(new URL('..', import.meta.url)),
  })

  let client: Client | undefined

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      fakeConvex?.server.close((error) => (error ? reject(error) : resolve()))
    })
    delete process.env.NUXT_PUBLIC_CONVEX_URL
  })

  afterEach(async () => {
    await client?.close()
    client = undefined
    convexRequests.length = 0
  })

  it('keeps public OAuth MCP out of the private service-actor starter', () => {
    const packageJson = JSON.parse(readSource('../package.json')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const dependencyNames = new Set([
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.devDependencies ?? {}),
    ])
    const runtimeSources = [
      './mcp/index.ts',
      './mcp/tools/projects-create.ts',
      './mcp/tools/projects-list.ts',
      './utils/mcpProjectTools.ts',
    ].map((path) => readSource(path))
    const forbiddenRuntimePatterns = [
      '@better-auth/oauth-provider',
      'mcpHandler',
      'oauthProviderResourceClient',
      'WWW-Authenticate',
      'oauth-protected-resource',
      'authorization_servers',
    ]

    expect(dependencyNames.has('@better-auth/oauth-provider')).toBe(false)
    for (const source of runtimeSources) {
      for (const pattern of forbiddenRuntimePatterns) {
        expect(source).not.toContain(pattern)
      }
    }
  })

  it('exposes project tools through a real Streamable HTTP MCP client', async () => {
    client = await createClient()

    const tools = await client.listTools()

    expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
      'projects.create',
      'projects.list',
    ])
  })

  it('routes read-only tools/call through the toolkit handler into Convex HTTP', async () => {
    client = await createClient()

    const result = await client.callTool({
      name: 'projects.list',
      arguments: { organizationId: 'org-1' },
    })
    const serializedResult = JSON.stringify(result)

    expect(result.isError).not.toBe(true)
    expect(serializedResult).toContain('Launch')
    expect(serializedResult).not.toContain('_id')
    expect(serializedResult).not.toContain(proofToken)
    expect(serializedResult).not.toContain(proofTokenHash)
    expect(serializedResult).not.toContain('credentialHash')
    expect(convexRequests).toHaveLength(1)
    expect(convexRequests[0]).toMatchObject({
      endpoint: '/api/query',
      path: 'projects:listForServiceActor',
      args: [
        {
          credentialHash: proofTokenHash,
          organizationId: 'org-1',
        },
      ],
    })
  })

  it('routes write tools/call through the toolkit handler into Convex HTTP', async () => {
    client = await createClient()

    const result = await client.callTool({
      name: 'projects.create',
      arguments: { organizationId: 'org-1', name: 'Launch' },
    })
    const serializedResult = JSON.stringify(result)

    expect(result.isError).not.toBe(true)
    expect(serializedResult).toContain('Created project project-2')
    expect(serializedResult).not.toContain(proofToken)
    expect(serializedResult).not.toContain(proofTokenHash)
    expect(serializedResult).not.toContain('credentialHash')
    expect(convexRequests).toHaveLength(1)
    expect(convexRequests[0]).toMatchObject({
      endpoint: '/api/mutation',
      path: 'projects:createFromServiceActor',
      args: [
        {
          credentialHash: proofTokenHash,
          organizationId: 'org-1',
          name: 'Launch',
        },
      ],
    })
  })

  it('lets the starter UI demo route create a project through the real MCP endpoint', async () => {
    const response = await $fetch<{ content: string[] }>('/api/demo/mcp-projects', {
      method: 'POST',
      body: {
        bearerToken: proofToken,
        organizationId: 'org-1',
        name: 'From UI demo',
      },
    })

    expect(response.content[0]).toContain('Created project project-2')
    expect(JSON.stringify(response)).not.toContain(proofToken)
    expect(JSON.stringify(response)).not.toContain(proofTokenHash)
    expect(convexRequests).toHaveLength(1)
    expect(convexRequests[0]).toMatchObject({
      endpoint: '/api/mutation',
      path: 'projects:createFromServiceActor',
      args: [
        {
          credentialHash: proofTokenHash,
          organizationId: 'org-1',
          name: 'From UI demo',
        },
      ],
    })
  })

  it('rejects undeclared tool calls through the MCP server', async () => {
    client = await createClient()

    const result = await client.callTool({
      name: 'projects.delete',
      arguments: { organizationId: 'org-1', projectId: 'project-1' },
    })

    expect(result.isError).toBe(true)
    expect(JSON.stringify(result.content)).toContain('Tool projects.delete not found')
    expect(convexRequests).toHaveLength(0)
  })

  it('lists project tools for unauthenticated clients but rejects calls without OAuth discovery', async () => {
    client = await createClient('')

    const tools = await client.listTools()
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
      'projects.create',
      'projects.list',
    ])

    const result = await client.callTool({
      name: 'projects.list',
      arguments: { organizationId: 'org-1' },
    })

    expect(result.isError).toBe(true)
    expect(JSON.stringify(result.content)).toContain('Bearer token required')
    expect(convexRequests).toHaveLength(0)
  })

  it('lists project tools when bearer syntax is malformed but rejects calls', async () => {
    client = await createClient('', 'not-a-bearer')

    const tools = await client.listTools()
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
      'projects.create',
      'projects.list',
    ])

    const result = await client.callTool({
      name: 'projects.list',
      arguments: { organizationId: 'org-1' },
    })

    expect(result.isError).toBe(true)
    expect(JSON.stringify(result.content)).toContain('Bearer token required')
    expect(convexRequests).toHaveLength(0)
  })

  it('lists project tools when bearer syntax has extra parts but rejects calls', async () => {
    client = await createClient('', 'Bearer proof-token extra')

    const tools = await client.listTools()
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
      'projects.create',
      'projects.list',
    ])

    const result = await client.callTool({
      name: 'projects.list',
      arguments: { organizationId: 'org-1' },
    })

    expect(result.isError).toBe(true)
    expect(JSON.stringify(result.content)).toContain('Bearer token required')
    expect(convexRequests).toHaveLength(0)
  })

  it('rejects cross-origin Streamable HTTP requests', async () => {
    const response = await $fetch('/mcp', {
      method: 'POST',
      ignoreResponseError: true,
      headers: {
        accept: 'application/json, text/event-stream',
        authorization: 'Bearer proof-token',
        'content-type': 'application/json',
        origin: 'https://evil.example',
      },
      body: {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      },
    })

    expect(response).toEqual({
      jsonrpc: '2.0',
      error: { code: -32600, message: 'Origin not allowed' },
      id: null,
    })
  })
})
