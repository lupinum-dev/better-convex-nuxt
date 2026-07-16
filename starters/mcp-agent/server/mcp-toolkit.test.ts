import { readdirSync, readFileSync, statSync } from 'node:fs'
import {
  createServer,
  request as createHttpRequest,
  type IncomingMessage,
  type Server,
} from 'node:http'
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
const testToken = 'test-token'
const testTokenHash = hashBearerSecret(testToken)
const testServerSecret = 'mcp-agent-local-test-server-secret-1234'
const expectedToolNames = [
  'approvals.get',
  'projects.create',
  'projects.create.preview',
  'projects.delete.execute',
  'projects.delete.preview',
  'projects.delete.requestApproval',
  'projects.list',
]

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
    const credentials = body.args[0] as
      | { bearerToken?: unknown; serverSecret?: unknown }
      | undefined
    if (credentials?.bearerToken !== testToken || credentials.serverSecret !== testServerSecret) {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(
        JSON.stringify({
          status: 'error',
          errorMessage: 'Service actor credential denied',
        }),
      )
      return
    }

    let value: unknown = 'project-2'
    if (body.path === 'projects:listForServiceActor') {
      value = [
        {
          _id: 'project-1',
          organizationId: 'org-1',
          name: 'Launch',
          createdBy: { kind: 'serviceActor', serviceActorId: 'actor-1' },
          status: 'active',
          createdAt: 1,
        },
      ]
    } else if (body.path === 'projects:previewCreateFromServiceActor') {
      value = {
        status: 'ready',
        operation: 'projects.create',
        requiresApproval: false,
        normalizedInput: { name: 'Launch' },
        nextActions: [{ tool: 'projects.create', arguments: { name: 'Launch' } }],
      }
    } else if (body.path === 'projects:previewDeleteFromServiceActor') {
      value = {
        status: 'ready',
        operation: 'projects.delete',
        requiresApproval: true,
        resource: { id: 'project-1', label: 'Launch', organizationId: 'org-1' },
        nextActions: [
          { tool: 'projects.delete.requestApproval', arguments: { projectId: 'project-1' } },
        ],
      }
    } else if (body.path === 'projects:requestDeleteApprovalFromServiceActor') {
      value = {
        status: 'waiting_for_approval',
        approvalRequestId: 'approval-1',
        message: 'Approval request created.',
        nextActions: [{ tool: 'approvals.get', arguments: { approvalRequestId: 'approval-1' } }],
      }
    } else if (body.path === 'approvals:getForServiceActor') {
      value = {
        approvalRequestId: 'approval-1',
        operation: 'projects.delete',
        resourceId: 'project-1',
        status: 'approved',
        nextActions: [
          {
            tool: 'projects.delete.execute',
            arguments: { projectId: 'project-1', approvalId: 'approval-1' },
          },
        ],
      }
    } else if (body.path === 'projects:deleteWithApproval') {
      value = {
        status: 'executed',
        operation: 'projects.delete',
        projectId: 'project-1',
        approvalId: 'approval-1',
        message: 'Soft-deleted project Launch.',
      }
    }

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

async function postChunked(path: string, chunks: string[]) {
  const target = new URL(path, url('/'))

  return await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
    const request = createHttpRequest(
      target,
      {
        method: 'POST',
        headers: {
          accept: 'application/json, text/event-stream',
          authorization: `Bearer ${testToken}`,
          connection: 'close',
          'content-type': 'application/json',
        },
      },
      (response) => {
        const responseChunks: Buffer[] = []
        response.on('data', (chunk) => {
          responseChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        })
        response.once('end', () => {
          resolve({
            statusCode: response.statusCode ?? 0,
            body: Buffer.concat(responseChunks).toString('utf8'),
          })
        })
      },
    )
    request.once('error', reject)
    for (const chunk of chunks) request.write(chunk)
    request.end()
  })
}

function readSource(path: string) {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
}

function readRuntimeSources(path: string): string[] {
  const absolutePath = fileURLToPath(new URL(path, import.meta.url))
  if (statSync(absolutePath).isFile()) {
    return [readFileSync(absolutePath, 'utf8')]
  }

  return readdirSync(absolutePath, { withFileTypes: true }).flatMap((entry) => {
    const childPath = `${path}/${entry.name}`
    if (entry.isDirectory()) return readRuntimeSources(childPath)
    return entry.name.endsWith('.ts') ? readRuntimeSources(childPath) : []
  })
}

async function createClient(token = testToken, authorizationHeader?: string) {
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
  process.env.MCP_SERVER_SECRET = testServerSecret

  await setup({
    rootDir: fileURLToPath(new URL('..', import.meta.url)),
  })

  let client: Client | undefined

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      fakeConvex?.server.close((error) => (error ? reject(error) : resolve()))
    })
    delete process.env.NUXT_PUBLIC_CONVEX_URL
    delete process.env.MCP_SERVER_SECRET
  })

  afterEach(async () => {
    await client?.close()
    client = undefined
    convexRequests.length = 0
  })

  it('renders the starter page through the built Nuxt server', async () => {
    const html = await $fetch<string>('/')

    expect(html).toContain('MCP agent starter')
    expect(html).toContain('data-testid="auth-form"')
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
    const runtimeSources = [...readRuntimeSources('./mcp'), ...readRuntimeSources('./utils')]
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

    expect(tools.tools.map((tool) => tool.name).sort()).toEqual(expectedToolNames)
    expect(tools.tools.find((tool) => tool.name === 'projects.list')?.inputSchema).toMatchObject({
      type: 'object',
      properties: {},
    })
    expect(tools.tools.find((tool) => tool.name === 'projects.create')?.inputSchema).toMatchObject({
      type: 'object',
      properties: {
        name: { minLength: 1, type: 'string' },
      },
      required: ['name'],
    })
    expect(
      tools.tools.find((tool) => tool.name === 'projects.delete.execute')?.inputSchema,
    ).toMatchObject({
      type: 'object',
      properties: {
        approvalId: { minLength: 1, type: 'string' },
        projectId: { minLength: 1, type: 'string' },
      },
      required: ['projectId', 'approvalId'],
    })
  })

  it('routes read-only tools/call through the toolkit handler into Convex HTTP', async () => {
    client = await createClient()

    const result = await client.callTool({
      name: 'projects.list',
      arguments: {},
    })
    const serializedResult = JSON.stringify(result)

    expect(result.isError).not.toBe(true)
    expect(serializedResult).toContain('Launch')
    expect(serializedResult).not.toContain('_id')
    expect(serializedResult).not.toContain(testToken)
    expect(serializedResult).not.toContain(testTokenHash)
    expect(serializedResult).not.toContain('credentialHash')
    expect(convexRequests).toHaveLength(1)
    expect(convexRequests[0]).toMatchObject({
      endpoint: '/api/query',
      path: 'projects:listForServiceActor',
      args: [
        {
          bearerToken: testToken,
          serverSecret: testServerSecret,
        },
      ],
    })
  })

  it('routes write tools/call through the toolkit handler into Convex HTTP', async () => {
    client = await createClient()

    const result = await client.callTool({
      name: 'projects.create',
      arguments: { name: 'Launch' },
    })
    const serializedResult = JSON.stringify(result)

    expect(result.isError).not.toBe(true)
    expect(serializedResult).toContain('Created project project-2')
    expect(serializedResult).not.toContain(testToken)
    expect(serializedResult).not.toContain(testTokenHash)
    expect(serializedResult).not.toContain('credentialHash')
    expect(convexRequests).toHaveLength(1)
    expect(convexRequests[0]).toMatchObject({
      endpoint: '/api/mutation',
      path: 'projects:createFromServiceActor',
      args: [
        {
          bearerToken: testToken,
          name: 'Launch',
          serverSecret: testServerSecret,
        },
      ],
    })
  })

  it('routes create preview through the toolkit handler into a Convex query', async () => {
    client = await createClient()

    const result = await client.callTool({
      name: 'projects.create.preview',
      arguments: { name: 'Launch' },
    })
    const serializedResult = JSON.stringify(result)

    expect(result.isError).not.toBe(true)
    expect(serializedResult).toContain('projects.create')
    expect(serializedResult).toContain('requiresApproval')
    expect(serializedResult).not.toContain(testToken)
    expect(serializedResult).not.toContain(testTokenHash)
    expect(convexRequests).toHaveLength(1)
    expect(convexRequests[0]).toMatchObject({
      endpoint: '/api/query',
      path: 'projects:previewCreateFromServiceActor',
      args: [
        {
          bearerToken: testToken,
          name: 'Launch',
          serverSecret: testServerSecret,
        },
      ],
    })
  })

  it('routes approval-gated destructive tools/call through the toolkit handler into Convex HTTP', async () => {
    client = await createClient()

    const result = await client.callTool({
      name: 'projects.delete.execute',
      arguments: {
        projectId: 'project-1',
        approvalId: 'approval-1',
      },
    })
    const serializedResult = JSON.stringify(result)

    expect(result.isError).not.toBe(true)
    expect(serializedResult).toContain('executed')
    expect(serializedResult).not.toContain(testToken)
    expect(serializedResult).not.toContain(testTokenHash)
    expect(serializedResult).not.toContain('credentialHash')
    expect(convexRequests).toHaveLength(1)
    expect(convexRequests[0]).toMatchObject({
      endpoint: '/api/mutation',
      path: 'projects:deleteWithApproval',
      args: [
        {
          approvalId: 'approval-1',
          bearerToken: testToken,
          projectId: 'project-1',
          serverSecret: testServerSecret,
        },
      ],
    })
  })

  it('lets the starter UI demo route reuse the MCP tool without a Host-derived loopback request', async () => {
    const response = await $fetch<{ content: string[] }>('/api/demo/mcp-projects', {
      method: 'POST',
      headers: { host: 'attacker.invalid' },
      body: {
        bearerToken: testToken,
        name: 'From UI demo',
      },
    })

    expect(response.content[0]).toContain('Created project project-2')
    expect(JSON.stringify(response)).not.toContain(testToken)
    expect(JSON.stringify(response)).not.toContain(testTokenHash)
    expect(convexRequests).toHaveLength(1)
    expect(convexRequests[0]).toMatchObject({
      endpoint: '/api/mutation',
      path: 'projects:createFromServiceActor',
      args: [
        {
          bearerToken: testToken,
          name: 'From UI demo',
          serverSecret: testServerSecret,
        },
      ],
    })

    const routeSource = readSource('./api/demo/mcp-projects.post.ts')
    expect(routeSource).not.toContain('getRequestURL')
    expect(routeSource).not.toContain('StreamableHTTPClientTransport')
  })

  it('uses the shared project validation message in the demo MCP route', async () => {
    const error = await $fetch('/api/demo/mcp-projects', {
      method: 'POST',
      ignoreResponseError: true,
      body: {
        bearerToken: testToken,
        name: '   ',
      },
    })

    expect(error).toMatchObject({
      statusCode: 400,
      statusMessage: 'Project name is required',
    })
    expect(convexRequests).toHaveLength(0)
  })

  it.each(['/mcp', '/api/demo/mcp-projects'])(
    'rejects an oversized chunked request at %s before body parsing or Convex access',
    async (path) => {
      const response = await postChunked(path, [
        '{"padding":"',
        'x'.repeat(40 * 1024),
        'x'.repeat(40 * 1024),
        '"}',
      ])

      expect(response.statusCode).toBe(413)
      expect(response.body).not.toContain(testToken)
      expect(convexRequests).toHaveLength(0)
    },
  )

  it('rejects undeclared tool calls through the MCP server', async () => {
    client = await createClient()

    const result = await client.callTool({
      name: 'projects.archive',
      arguments: { projectId: 'project-1' },
    })

    expect(result.isError).toBe(true)
    expect(JSON.stringify(result.content)).toContain('Tool projects.archive not found')
    expect(convexRequests).toHaveLength(0)
  })

  it('lists project tools for unauthenticated clients but rejects calls without OAuth discovery', async () => {
    client = await createClient('')

    const tools = await client.listTools()
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual(expectedToolNames)

    const result = await client.callTool({
      name: 'projects.list',
      arguments: {},
    })

    expect(result.isError).toBe(true)
    expect(JSON.stringify(result.content)).toContain('Bearer token required')
    expect(convexRequests).toHaveLength(0)
  })

  it('lists project tools when bearer syntax is malformed but rejects calls', async () => {
    client = await createClient('', 'not-a-bearer')

    const tools = await client.listTools()
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual(expectedToolNames)

    const result = await client.callTool({
      name: 'projects.list',
      arguments: {},
    })

    expect(result.isError).toBe(true)
    expect(JSON.stringify(result.content)).toContain('Bearer token required')
    expect(convexRequests).toHaveLength(0)
  })

  it('lists project tools when bearer syntax has extra parts but rejects calls', async () => {
    client = await createClient('', 'Bearer test-token extra')

    const tools = await client.listTools()
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual(expectedToolNames)

    const result = await client.callTool({
      name: 'projects.list',
      arguments: {},
    })

    expect(result.isError).toBe(true)
    expect(JSON.stringify(result.content)).toContain('Bearer token required')
    expect(convexRequests).toHaveLength(0)
  })

  it('rejects a well-formed but invalid bearer through the Convex credential boundary', async () => {
    client = await createClient('invalid-test-token')

    const result = await client.callTool({
      name: 'projects.list',
      arguments: {},
    })

    expect(result.isError).toBe(true)
    const serialized = JSON.stringify(result.content)
    expect(serialized).toContain('Service actor credential denied')
    expect(serialized).not.toContain('invalid-test-token')
    expect(serialized).not.toContain(testServerSecret)
    expect(convexRequests).toHaveLength(1)
  })

  it('rejects cross-origin Streamable HTTP requests', async () => {
    const response = await $fetch('/mcp', {
      method: 'POST',
      ignoreResponseError: true,
      headers: {
        accept: 'application/json, text/event-stream',
        authorization: 'Bearer test-token',
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
