import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import {
  McpUiResourceMetaSchema,
  McpUiToolMetaSchema,
} from '@modelcontextprotocol/ext-apps/app-bridge'
import { ConvexHttpClient } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  ensureLocalConvex,
  type EnsureLocalConvexResult,
} from '../../../../test/helpers/local-convex'
import { proveNotesDashboardBrowserBoundary } from '../apps/notes-dashboard/browser-proof'
import { buildNotesDashboard } from '../apps/notes-dashboard/build'
import { topologyConformanceVectors } from '../conformance-vectors'
import {
  abortRawHttp,
  chunkedBody,
  exchangeRawHttp,
  legacyInitializeBody,
  rawHttpRequest,
} from '../http-adversarial'
import {
  LAB_OAUTH_ISSUER,
  LAB_OAUTH_SCOPES,
  LAB_OAUTH_TOKENS,
  labOAuthResourceMetadataUrl,
} from '../oauth-fixture'

const root = fileURLToPath(new URL('../../../..', import.meta.url))
const sourceFixture = fileURLToPath(new URL('./fixture', import.meta.url))
const sharedOAuthFixture = fileURLToPath(new URL('../oauth-fixture.ts', import.meta.url))
const OWNER_TOKEN = LAB_OAUTH_TOKENS.alice
const EDITOR_TOKEN = LAB_OAUTH_TOKENS.bob
const managedEnvironmentNames = [
  'CONVEX_DEPLOYMENT',
  'CONVEX_E2E_AUTO_START',
  'CONVEX_SITE_URL',
  'CONVEX_URL',
  'NUXT_PUBLIC_CONVEX_SITE_URL',
  'NUXT_PUBLIC_CONVEX_URL',
] as const

let fixtureDirectory = ''
let local: EnsureLocalConvexResult | undefined
let notesDashboardHtml = ''
const savedEnvironment = new Map<string, string | undefined>()

function saveAndSetLabEnvironment(): void {
  for (const name of managedEnvironmentNames) {
    savedEnvironment.set(name, process.env[name])
    Reflect.deleteProperty(process.env, name)
  }
  process.env.CONVEX_E2E_AUTO_START = 'true'
}

function restoreEnvironment(): void {
  for (const [name, value] of savedEnvironment) {
    if (value === undefined) Reflect.deleteProperty(process.env, name)
    else process.env[name] = value
  }
}

async function materializeFixture(appHtml: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'better-convex-vnext-mcp-'))
  await cp(sourceFixture, directory, { recursive: true })
  await cp(sharedOAuthFixture, path.join(directory, 'convex', 'oauth_fixture.ts'))
  await writeFile(
    path.join(directory, 'convex', 'notes_dashboard.ts'),
    `export const NOTES_DASHBOARD_HTML = ${JSON.stringify(appHtml)}\n`,
  )
  await symlink(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), 'dir')
  return directory
}

function connectClient(
  siteUrl: string,
  token: string,
  name: string,
  responseBodies: string[],
  supportsApps: boolean,
): { client: Client; connect: Promise<void>; requestBodies: string[] } {
  const requestBodies: string[] = []
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    requestBodies.push(await request.clone().text())
    const response = await globalThis.fetch(request)
    responseBodies.push(await response.clone().text())
    return response
  }
  const transport = new StreamableHTTPClientTransport(new URL('/mcp', siteUrl), {
    authProvider: { token: async () => token },
    fetch,
  })
  const client = new Client(
    { name, version: '0.0.0' },
    supportsApps
      ? {
          capabilities: {
            extensions: {
              'io.modelcontextprotocol/ui': {
                mimeTypes: ['text/html;profile=mcp-app'],
              },
            },
          },
        }
      : undefined,
  )
  return { client, connect: client.connect(transport), requestBodies }
}

beforeAll(async () => {
  saveAndSetLabEnvironment()
  notesDashboardHtml = (await buildNotesDashboard()).appHtml
  fixtureDirectory = await materializeFixture(notesDashboardHtml)
  local = await ensureLocalConvex({
    cwd: fixtureDirectory,
    requireAuthDeployment: false,
    timeoutMs: 90_000,
  })

  const convex = new ConvexHttpClient(local.env.CONVEX_URL!)
  const seed = makeFunctionReference<'mutation', Record<string, never>, { seeded: boolean }>(
    'fixture:seed',
  )
  expect(await convex.mutation(seed, {})).toEqual({ seeded: true })
})

afterAll(async () => {
  try {
    await local?.release()
  } finally {
    restoreEnvironment()
    if (fixtureDirectory) await rm(fixtureDirectory, { force: true, recursive: true })
  }
})

describe('vNext Convex-native MCP topology probe', () => {
  it('executes the official SDK in a Convex HTTP action with current database authority', async () => {
    if (!local) throw new Error('Local Convex fixture is not ready')
    const fixtureManifest = JSON.parse(
      await readFile(path.join(sourceFixture, 'package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string> }
    expect(fixtureManifest.dependencies).toEqual({
      '@modelcontextprotocol/server': '2.0.0-beta.4',
      convex: '1.42.2',
      zod: '4.3.6',
    })
    const sources = await Promise.all(
      ['fixture.ts', 'http.ts', 'mcp.ts', 'operations.ts', 'schema.ts', 'notes_dashboard.ts'].map(
        (file) => readFile(path.join(sourceFixture, 'convex', file), 'utf8'),
      ),
    )
    const httpSource = sources[1]!
    const mcpSource = sources[2]!
    const operationsSource = sources[3]!
    const notesDashboardSource = sources[5]!
    const fixtureSource = sources.join('\n') + (await readFile(sharedOAuthFixture, 'utf8'))
    expect(fixtureSource.includes("from 'node:")).toBe(false)
    expect(fixtureSource.includes('@modelcontextprotocol/client')).toBe(false)
    expect(fixtureSource.includes('polyfill')).toBe(false)
    expect(httpSource).not.toContain('/api/auth/get-session')
    expect(httpSource.match(/handler: handleMcp/gu)).toHaveLength(1)
    expect(mcpSource.match(/requireLabOAuthAccess/gu)).toHaveLength(2)
    expect(operationsSource).not.toMatch(/\b(?:AuthInfo|Request|authorization|bearer|token)\b/iu)
    expect(notesDashboardSource).toContain(
      "export const NOTES_DASHBOARD_HTML = '__BCN_NOTES_DASHBOARD_BUILD_REQUIRED__'",
    )
    expect(notesDashboardSource).not.toContain('<!doctype html>')

    const responsesA: string[] = []
    const responsesB: string[] = []
    const connectionA = connectClient(
      local.env.CONVEX_SITE_URL!,
      OWNER_TOKEN,
      'convex-owner-client',
      responsesA,
      true,
    )
    const connectionB = connectClient(
      local.env.CONVEX_SITE_URL!,
      EDITOR_TOKEN,
      'convex-editor-client',
      responsesB,
      false,
    )

    try {
      await Promise.all([connectionA.connect, connectionB.connect])

      const mcpUrl = new URL('/mcp', local.env.CONVEX_SITE_URL!)
      const bearerBoundaryHeader = 'x-bcn-lab-bearer-boundary'
      const protectedMetadataUrl = new URL(labOAuthResourceMetadataUrl(mcpUrl))
      const protectedMetadataResponse = await fetch(protectedMetadataUrl)
      expect(protectedMetadataResponse.status).toBe(200)
      await expect(protectedMetadataResponse.json()).resolves.toMatchObject({
        authorization_servers: [LAB_OAUTH_ISSUER],
        resource: mcpUrl.href,
        scopes_supported: LAB_OAUTH_SCOPES,
      })
      const metadataWithBearer = await fetch(protectedMetadataUrl, {
        headers: { authorization: `Bearer ${OWNER_TOKEN}` },
      })
      expect(metadataWithBearer.status).toBe(200)
      expect(metadataWithBearer.headers.get(bearerBoundaryHeader)).toBeNull()
      const authorizationServerMetadata = await fetch(
        new URL('/.well-known/oauth-authorization-server', local.env.CONVEX_SITE_URL!),
      )
      expect(authorizationServerMetadata.status).toBe(200)
      await expect(authorizationServerMetadata.json()).resolves.toMatchObject({
        code_challenge_methods_supported: ['S256'],
        grant_types_supported: ['authorization_code'],
        issuer: LAB_OAUTH_ISSUER,
        token_endpoint_auth_methods_supported: ['none'],
      })

      const missingToken = await fetch(mcpUrl, {
        body: '{}',
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
      expect(missingToken.status).toBe(401)
      expect(missingToken.headers.get(bearerBoundaryHeader)).toBe('canonical-mcp')
      expect(missingToken.headers.get('www-authenticate')).toContain(
        `resource_metadata="${protectedMetadataUrl.href}"`,
      )
      for (const token of [
        LAB_OAUTH_TOKENS.expired,
        LAB_OAUTH_TOKENS.revoked,
        LAB_OAUTH_TOKENS.sessionClass,
        LAB_OAUTH_TOKENS.wrongClient,
        LAB_OAUTH_TOKENS.wrongIssuer,
        LAB_OAUTH_TOKENS.wrongResource,
      ]) {
        const invalid = await fetch(mcpUrl, {
          body: '{}',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          method: 'POST',
        })
        expect(invalid.status).toBe(401)
        expect(invalid.headers.get(bearerBoundaryHeader)).toBe('canonical-mcp')
        expect(await invalid.text()).not.toContain(token)
      }
      const insufficientScope = await fetch(mcpUrl, {
        body: '{}',
        headers: {
          authorization: `Bearer ${LAB_OAUTH_TOKENS.insufficientScope}`,
          'content-type': 'application/json',
        },
        method: 'POST',
      })
      expect(insufficientScope.status).toBe(403)
      expect(insufficientScope.headers.get('www-authenticate')).toContain('scope="notes:read"')

      const queryTokenUrl = new URL(mcpUrl)
      queryTokenUrl.searchParams.set('access_token', OWNER_TOKEN)
      const queryToken = await fetch(queryTokenUrl, {
        body: '{}',
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
      expect(queryToken.status).toBe(401)
      expect(await queryToken.text()).not.toContain(OWNER_TOKEN)
      const bodyToken = await fetch(mcpUrl, {
        body: JSON.stringify({ access_token: OWNER_TOKEN }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
      expect(bodyToken.status).toBe(401)
      expect(await bodyToken.text()).not.toContain(OWNER_TOKEN)

      const hostileOrigin = await fetch(mcpUrl, {
        body: '{}',
        headers: {
          authorization: `Bearer ${OWNER_TOKEN}`,
          'content-type': 'application/json',
          origin: 'https://attacker.invalid',
        },
        method: 'POST',
      })
      expect(hostileOrigin.status).toBe(403)
      expect(hostileOrigin.headers.get('cache-control')).toBe('no-store')
      expect(hostileOrigin.headers.get(bearerBoundaryHeader)).toBeNull()

      const encoded = await fetch(mcpUrl, {
        body: '{}',
        headers: {
          authorization: `Bearer ${OWNER_TOKEN}`,
          'content-encoding': 'gzip',
          'content-type': 'application/json',
        },
        method: 'POST',
      })
      expect(encoded.status).toBe(415)
      await expect(encoded.json()).resolves.toEqual({
        code: 'MCP_REQUEST_ENCODING_UNSUPPORTED',
      })

      const wrongContentType = await fetch(mcpUrl, {
        body: '{}',
        headers: {
          authorization: `Bearer ${OWNER_TOKEN}`,
          'content-type': 'text/plain',
        },
        method: 'POST',
      })
      expect(wrongContentType.status).toBe(415)

      const oversized = await fetch(mcpUrl, {
        body: 'x'.repeat(64 * 1024 + 1),
        headers: {
          authorization: `Bearer ${OWNER_TOKEN}`,
          'content-type': 'application/json',
        },
        method: 'POST',
      })
      expect(oversized.status).toBe(413)

      const wrongPath = await fetch(new URL('/mcp/extra', local.env.CONVEX_SITE_URL!), {
        body: '{}',
        headers: {
          authorization: `Bearer ${OWNER_TOKEN}`,
          'content-type': 'application/json',
        },
        method: 'POST',
      })
      expect(wrongPath.status).toBe(404)
      expect(wrongPath.headers.get(bearerBoundaryHeader)).toBeNull()
      const formerAuthProbe = await fetch(
        new URL('/api/auth/get-session', local.env.CONVEX_SITE_URL!),
        { headers: { authorization: `Bearer ${OWNER_TOKEN}` } },
      )
      expect(formerAuthProbe.status).toBe(404)
      expect(formerAuthProbe.headers.get(bearerBoundaryHeader)).toBeNull()
      const queryDisagreementUrl = new URL(mcpUrl)
      queryDisagreementUrl.searchParams.set('unexpected', '1')
      const queryDisagreement = await fetch(queryDisagreementUrl, {
        body: '{}',
        headers: {
          authorization: `Bearer ${OWNER_TOKEN}`,
          'content-type': 'application/json',
        },
        method: 'POST',
      })
      expect(queryDisagreement.status).toBe(404)
      const wrongMethod = await fetch(mcpUrl, {
        headers: { authorization: `Bearer ${OWNER_TOKEN}` },
        method: 'GET',
      })
      expect([404, 405]).toContain(wrongMethod.status)

      const rawHeaders = [
        ['Accept', 'application/json, text/event-stream'],
        ['Authorization', `Bearer ${OWNER_TOKEN}`],
        ['Content-Type', 'application/json'],
        ['Connection', 'close'],
      ] as const
      const duplicateLength = await exchangeRawHttp(
        mcpUrl,
        rawHttpRequest(mcpUrl, {
          body: '{}',
          headers: [...rawHeaders, ['Content-Length', '2'], ['Content-Length', '2']],
        }),
      )
      expect(duplicateLength.status).toBeNull()
      expect(duplicateLength.responseText).toBe('')
      const conflictingFraming = await exchangeRawHttp(
        mcpUrl,
        rawHttpRequest(mcpUrl, {
          body: chunkedBody(['{}']),
          headers: [...rawHeaders, ['Content-Length', '2'], ['Transfer-Encoding', 'chunked']],
        }),
      )
      expect(conflictingFraming.status).toBeNull()
      expect(conflictingFraming.responseText).toBe('')

      const initialize = legacyInitializeBody('chunked-initialize')
      const split = Math.floor(initialize.length / 2)
      const streamed = await exchangeRawHttp(
        mcpUrl,
        rawHttpRequest(mcpUrl, {
          body: chunkedBody([initialize.slice(0, split), initialize.slice(split)]),
          headers: [...rawHeaders.slice(0, -1), ['Transfer-Encoding', 'chunked']],
        }),
        { keepWriteOpen: true },
      )
      expect(streamed.status).toBe(200)

      const tracedInitialize = await fetch(mcpUrl, {
        body: legacyInitializeBody('bearer-boundary-trace'),
        headers: {
          accept: 'application/json, text/event-stream',
          authorization: `Bearer ${OWNER_TOKEN}`,
          'content-type': 'application/json',
        },
        method: 'POST',
      })
      expect(tracedInitialize.status).toBe(200)
      expect(tracedInitialize.headers.get(bearerBoundaryHeader)).toBe('canonical-mcp')
      expect(await tracedInitialize.text()).not.toContain(OWNER_TOKEN)

      const oversizedStream = await exchangeRawHttp(
        mcpUrl,
        rawHttpRequest(mcpUrl, {
          body: chunkedBody(['x'.repeat(64 * 1024 + 1)]),
          headers: [...rawHeaders.slice(0, -1), ['Transfer-Encoding', 'chunked']],
        }),
        { keepWriteOpen: true },
      )
      expect(oversizedStream.status).toBe(413)

      const incompleteChunk = rawHttpRequest(mcpUrl, {
        body: '10\r\n{',
        headers: [...rawHeaders.slice(0, -1), ['Transfer-Encoding', 'chunked']],
      })
      const stalled = await exchangeRawHttp(mcpUrl, incompleteChunk, {
        keepWriteOpen: true,
        timeoutMs: 3_000,
      })
      expect(stalled.status).toBe(408)
      await abortRawHttp(mcpUrl, incompleteChunk)

      console.info(
        `[vnext-convex-http] origin=${hostileOrigin.status} encoding=${encoded.status} contentType=${wrongContentType.status} oversized=${oversized.status} path=${wrongPath.status} query=${queryDisagreement.status} method=${wrongMethod.status} duplicateLength=${duplicateLength.status} conflictingFraming=${conflictingFraming.status} streamed=${streamed.status} streamedOversized=${oversizedStream.status} stalled=${stalled.status}`,
      )

      const [toolsA, toolsB] = await Promise.all([
        connectionA.client.listTools(),
        connectionB.client.listTools(),
      ])
      expect(toolsA.tools.map((tool) => tool.name).sort()).toEqual(
        topologyConformanceVectors.expectedTools,
      )
      expect(toolsB.tools.map((tool) => tool.name).sort()).toEqual(
        topologyConformanceVectors.expectedTools,
      )
      expect(JSON.stringify(toolsA.tools)).not.toContain('subject')
      const supportedSearch = toolsA.tools.find((tool) => tool.name === 'search_notes')
      const unsupportedSearch = toolsB.tools.find((tool) => tool.name === 'search_notes')
      expect(supportedSearch?._meta).toEqual({
        ui: {
          resourceUri: 'ui://notes/dashboard.html',
          visibility: ['model', 'app'],
        },
      })
      expect(unsupportedSearch?._meta).toEqual(supportedSearch?._meta)
      expect(
        McpUiToolMetaSchema.parse((supportedSearch?._meta as { ui?: unknown } | undefined)?.ui),
      ).toEqual(supportedSearch?._meta?.ui)

      const supportedRequests = connectionA.requestBodies
        .filter(Boolean)
        .map((body) => JSON.parse(body) as { method?: string; params?: Record<string, unknown> })
      const unsupportedRequests = connectionB.requestBodies
        .filter(Boolean)
        .map((body) => JSON.parse(body) as { method?: string; params?: Record<string, unknown> })
      expect(supportedRequests[0]).toMatchObject({
        method: 'initialize',
        params: {
          capabilities: {
            extensions: {
              'io.modelcontextprotocol/ui': {
                mimeTypes: ['text/html;profile=mcp-app'],
              },
            },
          },
        },
      })
      expect(unsupportedRequests[0]).toMatchObject({
        method: 'initialize',
        params: { capabilities: {} },
      })

      const dashboard = await connectionA.client.readResource({
        uri: 'ui://notes/dashboard.html',
      })
      expect(dashboard.contents).toEqual([
        {
          _meta: {
            ui: {
              csp: {
                baseUriDomains: [],
                connectDomains: [],
                frameDomains: [],
                resourceDomains: [],
              },
              permissions: {},
              prefersBorder: true,
            },
          },
          mimeType: 'text/html;profile=mcp-app',
          text: notesDashboardHtml,
          uri: 'ui://notes/dashboard.html',
        },
      ])
      expect(
        McpUiResourceMetaSchema.parse(
          (dashboard.contents[0]!._meta as { ui?: unknown } | undefined)?.ui,
        ),
      ).toEqual(dashboard.contents[0]!._meta?.ui)
      const unsupportedFallback = await connectionB.client.callTool({
        arguments: { query: 'beta', workspaceId: 'workspace-b' },
        name: 'search_notes',
      })
      expect(unsupportedFallback).toMatchObject({
        content: [{ type: 'text' }],
        structuredContent: {
          matches: [{ id: 'note-b', title: 'Beta' }],
        },
      })
      const appsProof = await proveNotesDashboardBrowserBoundary({
        build: await buildNotesDashboard(),
        callTool: (call) => connectionA.client.callTool(call),
      })
      expect(appsProof.toolCalls).toEqual([
        {
          arguments: { limit: 5, query: '', workspaceId: 'workspace-a' },
          name: 'search_notes',
        },
      ])

      const concurrentSearches = await Promise.all(
        Array.from({ length: 16 }, (_, index) =>
          (index % 2 === 0 ? connectionA.client : connectionB.client).callTool({
            arguments: {
              query: '',
              workspaceId: index % 2 === 0 ? 'workspace-a' : 'workspace-b',
            },
            name: 'search_notes',
          }),
        ),
      )
      expect(
        concurrentSearches.every(
          (result) =>
            Array.isArray(
              (result.structuredContent as { matches?: unknown[] } | undefined)?.matches,
            ) && (result.structuredContent as { matches: unknown[] }).matches.length === 1,
        ),
      ).toBe(true)

      const [searchA, searchB] = await Promise.all([
        connectionA.client.callTool(topologyConformanceVectors.search.allowed),
        connectionB.client.callTool({
          arguments: { query: '', workspaceId: 'workspace-b' },
          name: 'search_notes',
        }),
      ])
      expect(searchA.structuredContent).toMatchObject({ matches: [{ id: 'note-a' }] })
      expect(searchA.content).toEqual([
        { text: JSON.stringify(searchA.structuredContent), type: 'text' },
      ])
      expect(searchB.structuredContent).toMatchObject({ matches: [{ id: 'note-b' }] })

      const [renameA, renameB] = await Promise.all([
        connectionA.client.callTool(topologyConformanceVectors.rename.first),
        connectionB.client.callTool({
          arguments: { noteId: 'note-b', requestKey: 'rename-b', title: 'Beta renamed' },
          name: 'rename_note',
        }),
      ])
      expect(renameA.structuredContent).toMatchObject({ noteId: 'note-a', title: 'Alpha renamed' })
      expect(renameA.content).toEqual([
        { text: JSON.stringify(renameA.structuredContent), type: 'text' },
      ])
      expect(renameB.structuredContent).toMatchObject({ noteId: 'note-b', title: 'Beta renamed' })

      const renameReplay = await connectionA.client.callTool(
        topologyConformanceVectors.rename.first,
      )
      expect(renameReplay.structuredContent).toEqual(renameA.structuredContent)
      const renameConflict = await connectionA.client.callTool(
        topologyConformanceVectors.rename.conflicting,
      )
      expect(renameConflict).toMatchObject({
        content: [{ text: JSON.stringify({ code: 'IDEMPOTENCY_CONFLICT' }), type: 'text' }],
        isError: true,
      })

      const [resourceA, resourceB] = await Promise.all([
        connectionA.client.readResource(topologyConformanceVectors.resource),
        connectionB.client.readResource({ uri: 'note://note-b' }),
      ])
      expect(resourceA.contents[0]).toMatchObject({ uri: 'note://note-a' })
      expect(resourceB.contents[0]).toMatchObject({ uri: 'note://note-b' })

      const crossTenant = await connectionA.client.callTool(
        topologyConformanceVectors.search.crossTenant,
      )
      expect(crossTenant).toMatchObject({
        content: [{ text: JSON.stringify({ code: 'ACCESS_DENIED' }), type: 'text' }],
        isError: true,
      })

      const forgedIdentity = await connectionA.client.callTool(
        topologyConformanceVectors.malformedSearch,
      )
      expect(forgedIdentity.isError).toBe(true)

      const [report, deniedDelete] = await Promise.all([
        connectionA.client.callTool({
          arguments: { workspaceId: 'workspace-a' },
          name: 'generate_report',
        }),
        connectionB.client.callTool({
          arguments: { expectedRevision: 1, workspaceId: 'workspace-b' },
          name: 'delete_workspace',
        }),
      ])
      expect(report.structuredContent).toMatchObject({ noteCount: 1, workspaceId: 'workspace-a' })
      expect(deniedDelete).toMatchObject({
        content: [{ text: JSON.stringify({ code: 'ACCESS_DENIED' }), type: 'text' }],
        isError: true,
      })

      const convex = new ConvexHttpClient(local.env.CONVEX_URL!)
      const inaccessibleOperation = makeFunctionReference<
        'query',
        { principal: { subject: string }; query: string; workspaceId: string },
        unknown
      >('operations:searchNotes')
      await expect(
        convex.query(inaccessibleOperation, {
          principal: { subject: 'alice' },
          query: '',
          workspaceId: 'workspace-a',
        }),
      ).rejects.toThrow(/public function/iu)
      const inaccessibleHttpAction = makeFunctionReference<
        'action',
        Record<string, never>,
        unknown
      >('mcp:handleMcp')
      await expect(convex.action(inaccessibleHttpAction, {})).rejects.toThrow(/public function/iu)
      const setMember = makeFunctionReference<
        'mutation',
        { role: 'editor' | 'owner'; status: 'active' | 'removed'; subject: string },
        { role: 'editor' | 'owner'; status: 'active' | 'removed'; subject: string }
      >('fixture:setMember')
      const setMemberWithBearer = makeFunctionReference<
        'mutation',
        {
          authorization: string
          role: 'editor' | 'owner'
          status: 'active' | 'removed'
          subject: string
        },
        unknown
      >('fixture:setMember')
      await expect(
        convex.mutation(setMemberWithBearer, {
          authorization: `Bearer ${OWNER_TOKEN}`,
          role: 'owner',
          status: 'active',
          subject: 'bob',
        }),
      ).rejects.toThrow(/extra field.*authorization/iu)
      await expect(
        convex.mutation(setMember, { role: 'owner', status: 'active', subject: 'bob' }),
      ).resolves.toEqual({ role: 'owner', status: 'active', subject: 'bob' })
      const allowedAfterLiveRoleChange = await connectionB.client.callTool({
        arguments: { expectedRevision: 1, workspaceId: 'workspace-b' },
        name: 'delete_workspace',
      })
      expect(allowedAfterLiveRoleChange.structuredContent).toMatchObject({
        deletedNoteCount: 1,
        revision: 2,
        workspaceId: 'workspace-b',
      })

      const deleted = await connectionA.client.callTool({
        arguments: { expectedRevision: 1, workspaceId: 'workspace-a' },
        name: 'delete_workspace',
      })
      expect(deleted.structuredContent).toMatchObject({
        deletedNoteCount: 1,
        revision: 2,
        workspaceId: 'workspace-a',
      })

      const responseText = [...responsesA, ...responsesB].join('\n')
      for (const token of Object.values(LAB_OAUTH_TOKENS)) {
        expect(responseText).not.toContain(token)
      }
    } finally {
      await Promise.allSettled([connectionA.client.close(), connectionB.client.close()])
    }
  })
})
