import { execFile as execFileCallback, spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import {
  Client,
  SERVER_INFO_META_KEY,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client'
import { ConvexHttpClient } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'
import { describe, expect, it } from 'vitest'

import {
  ensureLocalConvex,
  type EnsureLocalConvexResult,
} from '../../../../test/helpers/local-convex'
import {
  abortRawHttp,
  chunkedBody,
  exchangeRawHttp,
  legacyInitializeBody,
  rawHttpRequest,
} from '../http-adversarial'
import { formatLatencySummary, measureSequentialLatency } from '../latency-measure'
import {
  LAB_OAUTH_ISSUER,
  LAB_OAUTH_SCOPES,
  LAB_OAUTH_TOKENS,
  labOAuthResourceMetadataUrl,
} from '../oauth-fixture'
import { runOfficialMcpToolProbe } from '../official-tools'
import {
  enterExactCallLocalEnvironment,
  exactCallVerifierJwk,
  materializeExactCallFixture,
} from './exact-call/deployment-fixture'
import { NITRO_MCP_LAB_MAX_BODY_BYTES } from './notes-handler'

const execFile = promisify(execFileCallback)
const root = fileURLToPath(new URL('../../../..', import.meta.url))
const fixture = fileURLToPath(new URL('./fixture', import.meta.url))
const OWNER_TOKEN = LAB_OAUTH_TOKENS.alice
const EXACT_CALL_KEY_ID = 'active-2026-07'
const seedExactCall = makeFunctionReference<'mutation', Record<string, never>, { seeded: boolean }>(
  'fixture:seed',
)
const setExactCallMemberStatus = makeFunctionReference<
  'mutation',
  { status: 'active' | 'removed'; subject: string },
  { status: 'active' | 'removed'; subject: string }
>('fixture:setMemberStatus')

async function availablePort(): Promise<number> {
  const server = createServer()
  server.unref()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Invalid loopback address')
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
  return address.port
}

async function filesBelow(directory: string): Promise<string[]> {
  const files: string[] = []
  const visit = async (current: string) => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name)
      if (entry.isDirectory()) await visit(target)
      else if (entry.isFile()) files.push(target)
    }
  }
  await visit(directory)
  return files.sort()
}

async function waitUntilReady(origin: string, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 20_000
  let lastError: unknown
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error('Nitro production server exited before readiness')
    }
    try {
      const response = await fetch(origin, { signal: AbortSignal.timeout(1_000) })
      if (response.status === 200) return
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(
    `Nitro production server readiness timed out${lastError instanceof Error ? `: ${lastError.message}` : ''}`,
  )
}

async function stop(child: ChildProcess | undefined): Promise<void> {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  const exited = await Promise.race([
    once(child, 'exit').then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3_000)),
  ])
  if (!exited) {
    child.kill('SIGKILL')
    await once(child, 'exit')
  }
}

describe('vNext Nitro MCP production runtime purity', () => {
  it('builds and runs the server SDK without shipping the client SDK to the browser', async () => {
    const temporary = await mkdtemp(path.join(tmpdir(), 'better-convex-vnext-nitro-'))
    const buildDir = path.join(temporary, 'build')
    const outputDir = path.join(temporary, 'output')
    let exactCallFixture = ''
    let exactCallLocal: EnsureLocalConvexResult | undefined
    let restoreEnvironment: (() => void) | undefined
    let server: ChildProcess | undefined
    let client: Client | undefined
    let modernClient: Client | undefined
    let readOnlyClient: Client | undefined
    let bobClient: Client | undefined

    try {
      restoreEnvironment = enterExactCallLocalEnvironment()
      const port = await availablePort()
      const origin = `http://127.0.0.1:${port}`
      const mcpResource = new URL('/api/mcp', origin).href
      const keyPair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])
      const privateJwk = {
        ...(await crypto.subtle.exportKey('jwk', keyPair.privateKey)),
        alg: 'EdDSA',
        key_ops: ['sign'],
        use: 'sig',
      }
      const privateJwkJson = JSON.stringify(privateJwk)
      exactCallFixture = await materializeExactCallFixture()
      exactCallLocal = await ensureLocalConvex({
        cwd: exactCallFixture,
        deploymentEnv: {
          BCN_VNEXT_EXACT_CALL_MCP_ISSUER: LAB_OAUTH_ISSUER,
          BCN_VNEXT_EXACT_CALL_MCP_RESOURCE: mcpResource,
          BCN_VNEXT_EXACT_CALL_PUBLIC_KEYS: JSON.stringify({
            [EXACT_CALL_KEY_ID]: await exactCallVerifierJwk(keyPair.publicKey),
          }),
        },
        requireAuthDeployment: false,
        timeoutMs: 60_000,
      })
      const exactCallConvex = new ConvexHttpClient(exactCallLocal.env.CONVEX_URL!)
      expect(await exactCallConvex.mutation(seedExactCall, {})).toEqual({ seeded: true })

      const exactCallEnvironment = {
        BCN_VNEXT_EXACT_CALL_ENDPOINT: exactCallLocal.env.CONVEX_SITE_URL!,
        BCN_VNEXT_EXACT_CALL_KEY_ID: EXACT_CALL_KEY_ID,
        BCN_VNEXT_EXACT_CALL_PRIVATE_JWK: privateJwkJson,
      }
      await execFile('pnpm', ['exec', 'nuxt', 'build', fixture], {
        cwd: root,
        env: {
          ...process.env,
          BCN_VNEXT_NITRO_BUILD_DIR: buildDir,
          BCN_VNEXT_NITRO_OUTPUT_DIR: outputDir,
          ...exactCallEnvironment,
          NODE_ENV: 'production',
        },
        maxBuffer: 16 * 1024 * 1024,
        timeout: 90_000,
      })

      const outputFiles = await filesBelow(outputDir)
      const serverEntry = path.join(outputDir, 'server', 'index.mjs')
      expect(outputFiles).toContain(serverEntry)
      const publicFiles = outputFiles.filter((file) =>
        file.includes(`${path.sep}public${path.sep}`),
      )
      const publicText = (
        await Promise.all(
          publicFiles
            .filter((file) => /\.(?:js|json|mjs)$/u.test(file))
            .map((file) => readFile(file, 'utf8')),
        )
      ).join('\n')
      expect(publicText.includes('@modelcontextprotocol/server')).toBe(false)
      expect(publicText.includes('@modelcontextprotocol/client')).toBe(false)
      expect(publicText.includes('better-convex-nitro-topology-lab')).toBe(false)
      for (const token of Object.values(LAB_OAUTH_TOKENS)) {
        expect(publicText.includes(token)).toBe(false)
      }

      const serverTextFiles = outputFiles.filter(
        (file) => file.includes(`${path.sep}server${path.sep}`) && /\.(?:js|json|mjs)$/u.test(file),
      )
      const applicationTextFiles = serverTextFiles.filter(
        (file) => !file.includes(`${path.sep}node_modules${path.sep}`),
      )
      const applicationText = (
        await Promise.all(applicationTextFiles.map((file) => readFile(file, 'utf8')))
      ).join('\n')
      expect(applicationText.includes('better-convex-nitro-topology-lab')).toBe(true)
      expect(applicationText.includes('@modelcontextprotocol/client')).toBe(false)
      expect(applicationText.includes('vnext-convex-lab-owner-token')).toBe(false)
      expect(applicationText.includes(privateJwkJson)).toBe(false)
      expect(applicationText.includes('parseMcpRequest')).toBe(false)

      const serverManifest = JSON.parse(
        await readFile(path.join(outputDir, 'server', 'package.json'), 'utf8'),
      ) as { dependencies?: Record<string, string> }
      expect(serverManifest.dependencies).toMatchObject({
        '@modelcontextprotocol/core': '2.0.0-beta.5',
        '@modelcontextprotocol/server': '2.0.0-beta.5',
        zod: '4.3.6',
      })
      expect(serverManifest.dependencies?.['@modelcontextprotocol/client']).toBeUndefined()
      expect(
        outputFiles.some((file) =>
          file.includes(`${path.sep}@modelcontextprotocol${path.sep}client${path.sep}`),
        ),
      ).toBe(false)

      server = spawn(process.execPath, [serverEntry], {
        cwd: outputDir,
        env: {
          ...process.env,
          NITRO_HOST: '127.0.0.1',
          NITRO_PORT: String(port),
          NODE_ENV: 'production',
          BCN_VNEXT_MCP_PUBLIC_ORIGIN: origin,
          ...exactCallEnvironment,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      await waitUntilReady(origin, server)

      const responseBodies: string[] = []
      const modernResponseBodies: string[] = []
      const mcpUrl = new URL('/api/mcp', origin)
      const protectedMetadataUrl = new URL(labOAuthResourceMetadataUrl(mcpUrl))
      const protectedMetadataResponse = await fetch(protectedMetadataUrl)
      expect(protectedMetadataResponse.status).toBe(200)
      await expect(protectedMetadataResponse.json()).resolves.toMatchObject({
        authorization_servers: [LAB_OAUTH_ISSUER],
        resource: mcpUrl.href,
        scopes_supported: LAB_OAUTH_SCOPES,
      })
      const authorizationServerMetadata = await fetch(
        new URL('/.well-known/oauth-authorization-server', origin),
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

      const transport = new StreamableHTTPClientTransport(mcpUrl, {
        authProvider: { token: async () => OWNER_TOKEN },
        fetch: async (input, init) => {
          const response = await fetch(input, init)
          responseBodies.push(await response.clone().text())
          return response
        },
      })
      client = new Client({ name: 'nitro-production-probe', version: '0.0.0' })
      await client.connect(transport)
      const tools = await client.listTools()
      expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
        'delete_workspace',
        'generate_report',
        'rename_note',
        'search_notes',
      ])
      const modernTransport = new StreamableHTTPClientTransport(mcpUrl, {
        authProvider: { token: async () => OWNER_TOKEN },
        fetch: async (input, init) => {
          const response = await fetch(input, init)
          modernResponseBodies.push(await response.clone().text())
          return response
        },
      })
      modernClient = new Client(
        { name: 'nitro-modern-production-probe', version: '0.0.0' },
        { versionNegotiation: { mode: { pin: '2026-07-28' } } },
      )
      await modernClient.connect(modernTransport)
      const modernTools = await modernClient.listTools()
      expect(modernTools.tools.map((tool) => tool.name).sort()).toEqual([
        'delete_workspace',
        'generate_report',
        'rename_note',
        'search_notes',
      ])
      expect(modernResponseBodies.some((body) => body.includes(SERVER_INFO_META_KEY))).toBe(true)
      const search = await client.callTool({
        arguments: { query: 'alpha', workspaceId: 'workspace-a' },
        name: 'search_notes',
      })
      expect(search).toMatchObject({ structuredContent: { matches: [{ id: 'note-a' }] } })

      const readOnlyTransport = new StreamableHTTPClientTransport(mcpUrl, {
        authProvider: { token: async () => LAB_OAUTH_TOKENS.readOnly },
        fetch: async (input, init) => {
          const response = await fetch(input, init)
          responseBodies.push(await response.clone().text())
          return response
        },
      })
      readOnlyClient = new Client({ name: 'nitro-read-only-probe', version: '0.0.0' })
      await readOnlyClient.connect(readOnlyTransport)
      const readOnlySearch = await readOnlyClient.callTool({
        arguments: { query: 'alpha', workspaceId: 'workspace-a' },
        name: 'search_notes',
      })
      expect(readOnlySearch.structuredContent).toMatchObject({ matches: [{ id: 'note-a' }] })
      const readOnlyRename = await readOnlyClient.callTool({
        arguments: { noteId: 'note-a', requestKey: 'scope-denied', title: 'Denied' },
        name: 'rename_note',
      })
      expect(readOnlyRename).toMatchObject({
        content: [{ text: JSON.stringify({ code: 'ACCESS_DENIED' }), type: 'text' }],
        isError: true,
      })

      const bobTransport = new StreamableHTTPClientTransport(mcpUrl, {
        authProvider: { token: async () => LAB_OAUTH_TOKENS.bob },
        fetch: async (input, init) => {
          const response = await fetch(input, init)
          responseBodies.push(await response.clone().text())
          return response
        },
      })
      bobClient = new Client({ name: 'nitro-bob-probe', version: '0.0.0' })
      await bobClient.connect(bobTransport)
      const [aliceIsolated, bobIsolated] = await Promise.all([
        client.callTool({
          arguments: { query: '', workspaceId: 'workspace-a' },
          name: 'search_notes',
        }),
        bobClient.callTool({
          arguments: { query: '', workspaceId: 'workspace-b' },
          name: 'search_notes',
        }),
      ])
      expect(aliceIsolated.structuredContent).toMatchObject({ matches: [{ id: 'note-a' }] })
      expect(bobIsolated.structuredContent).toMatchObject({ matches: [{ id: 'note-b' }] })
      const bobCrossTenant = await bobClient.callTool({
        arguments: { query: '', workspaceId: 'workspace-a' },
        name: 'search_notes',
      })
      expect(bobCrossTenant).toMatchObject({
        content: [{ text: JSON.stringify({ code: 'ACCESS_DENIED' }), type: 'text' }],
        isError: true,
      })
      const bobDelete = await bobClient.callTool({
        arguments: { expectedRevision: 1, workspaceId: 'workspace-b' },
        name: 'delete_workspace',
      })
      expect(bobDelete).toMatchObject({
        content: [{ text: JSON.stringify({ code: 'ACCESS_DENIED' }), type: 'text' }],
        isError: true,
      })
      const latency = await measureSequentialLatency(() =>
        client!.callTool({
          arguments: { query: 'alpha', workspaceId: 'workspace-a' },
          name: 'search_notes',
        }),
      )
      console.info(formatLatencySummary('vnext-nitro-integrated-latency', latency))

      const resource = await client.readResource({ uri: 'note://note-a' })
      expect(resource.contents).toMatchObject([
        { mimeType: 'application/json', uri: 'note://note-a' },
      ])
      expect(JSON.parse((resource.contents[0] as { text: string }).text)).toMatchObject({
        body: 'Alpha body',
        id: 'note-a',
      })
      const rename = await client.callTool({
        arguments: { noteId: 'note-a', requestKey: 'nitro-integrated-rename', title: 'Renamed' },
        name: 'rename_note',
      })
      expect(rename.structuredContent).toMatchObject({
        changed: true,
        noteId: 'note-a',
        previousTitle: 'Alpha',
        title: 'Renamed',
      })
      const renameReplay = await client.callTool({
        arguments: { noteId: 'note-a', requestKey: 'nitro-integrated-rename', title: 'Renamed' },
        name: 'rename_note',
      })
      expect(renameReplay.structuredContent).toEqual(rename.structuredContent)
      const report = await client.callTool({
        arguments: { workspaceId: 'workspace-a' },
        name: 'generate_report',
      })
      expect(report.structuredContent).toMatchObject({
        noteCount: 1,
        titles: ['Renamed'],
        workspaceId: 'workspace-a',
      })

      await exactCallConvex.mutation(setExactCallMemberStatus, {
        status: 'removed',
        subject: 'alice',
      })
      const revoked = await client.callTool({
        arguments: { query: '', workspaceId: 'workspace-a' },
        name: 'search_notes',
      })
      expect(revoked).toMatchObject({
        content: [{ text: JSON.stringify({ code: 'ACCESS_DENIED' }), type: 'text' }],
        isError: true,
      })
      await exactCallConvex.mutation(setExactCallMemberStatus, {
        status: 'active',
        subject: 'alice',
      })

      if (process.env.BCN_VNEXT_MCP_OFFICIAL_TOOLS === 'true') {
        const officialTools = await runOfficialMcpToolProbe({
          endpoint: mcpUrl,
          label: 'Nitro-native',
          repositoryRoot: root,
          token: OWNER_TOKEN,
        })
        expect(officialTools.inspectorMethods).toEqual([
          'tools/list',
          'tools/call',
          'resources/templates/list',
          'resources/read',
        ])
        expect(officialTools.conformanceScenarios).toEqual([
          'server-initialize',
          'ping',
          'tools-list',
          'resources-list',
        ])
      }

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
        body: 'x'.repeat(NITRO_MCP_LAB_MAX_BODY_BYTES + 1),
        headers: {
          authorization: `Bearer ${OWNER_TOKEN}`,
          'content-type': 'application/json',
        },
        method: 'POST',
      })
      expect(oversized.status).toBe(413)

      const wrongPath = await fetch(new URL('/api/mcp/extra', origin), {
        body: '{}',
        headers: {
          authorization: `Bearer ${OWNER_TOKEN}`,
          'content-type': 'application/json',
        },
        method: 'POST',
      })
      expect(wrongPath.headers.get('content-type')).toContain('text/html')
      expect(await wrongPath.text()).not.toContain('better-convex-nitro-topology-lab')
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
      expect(wrongMethod.status).toBe(405)

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
      expect(duplicateLength.status).toBe(400)
      const conflictingFraming = await exchangeRawHttp(
        mcpUrl,
        rawHttpRequest(mcpUrl, {
          body: chunkedBody(['{}']),
          headers: [...rawHeaders, ['Content-Length', '2'], ['Transfer-Encoding', 'chunked']],
        }),
      )
      expect(conflictingFraming.status).toBe(400)

      const initialize = legacyInitializeBody('chunked-initialize')
      const split = Math.floor(initialize.length / 2)
      const streamed = await exchangeRawHttp(
        mcpUrl,
        rawHttpRequest(mcpUrl, {
          body: chunkedBody([initialize.slice(0, split), initialize.slice(split)]),
          headers: [...rawHeaders, ['Transfer-Encoding', 'chunked']],
        }),
      )
      expect(streamed.status).toBe(200)

      const oversizedStream = await exchangeRawHttp(
        mcpUrl,
        rawHttpRequest(mcpUrl, {
          body: chunkedBody(['x'.repeat(NITRO_MCP_LAB_MAX_BODY_BYTES + 1)]),
          headers: [...rawHeaders, ['Transfer-Encoding', 'chunked']],
        }),
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

      const concurrentSearches = await Promise.all(
        Array.from({ length: 16 }, () =>
          client!.callTool({
            arguments: { query: 'alpha', workspaceId: 'workspace-a' },
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
      const deleted = await client.callTool({
        arguments: { expectedRevision: 1, workspaceId: 'workspace-a' },
        name: 'delete_workspace',
      })
      expect(deleted.structuredContent).toMatchObject({
        deletedNoteCount: 1,
        revision: 2,
        workspaceId: 'workspace-a',
      })
      const afterDelete = await client.callTool({
        arguments: { query: '', workspaceId: 'workspace-a' },
        name: 'search_notes',
      })
      expect(afterDelete).toMatchObject({ isError: true })

      await exactCallLocal.release()
      exactCallLocal = undefined
      const unavailableConvex = await client.callTool({
        arguments: { query: '', workspaceId: 'workspace-a' },
        name: 'search_notes',
      })
      expect(unavailableConvex).toMatchObject({
        content: [{ text: JSON.stringify({ code: 'OPERATION_FAILED' }), type: 'text' }],
        isError: true,
      })
      const serializedResponses = responseBodies.join('\n')
      for (const token of Object.values(LAB_OAUTH_TOKENS)) {
        expect(serializedResponses).not.toContain(token)
      }
      expect(serializedResponses).not.toContain(privateJwk.d)
      expect(serializedResponses).not.toContain('ServiceCall ')
      expect(serializedResponses).not.toContain('"callId"')
      expect(serializedResponses).not.toContain('"authorizationReference"')
      expect(serializedResponses).not.toContain('better-convex-nitro-lab')

      console.info(
        `[vnext-nitro-http] origin=${hostileOrigin.status} encoding=${encoded.status} contentType=${wrongContentType.status} oversized=${oversized.status} routerMiss=${wrongPath.status} query=${queryDisagreement.status} method=${wrongMethod.status} duplicateLength=${duplicateLength.status} conflictingFraming=${conflictingFraming.status} streamed=${streamed.status} streamedOversized=${oversizedStream.status} stalled=${stalled.status}`,
      )

      const serverBytes = (
        await Promise.all(serverTextFiles.map(async (file) => (await stat(file)).size))
      ).reduce((total, size) => total + size, 0)
      console.info(
        `[vnext-nitro-artifact] files=${outputFiles.length} applicationTextFiles=${applicationTextFiles.length} serverTextFiles=${serverTextFiles.length} serverTextBytes=${serverBytes} publicMcpBytes=0`,
      )
    } finally {
      await client?.close().catch(() => {})
      await modernClient?.close().catch(() => {})
      await readOnlyClient?.close().catch(() => {})
      await bobClient?.close().catch(() => {})
      await stop(server)
      await exactCallLocal?.release()
      restoreEnvironment?.()
      if (exactCallFixture) await rm(exactCallFixture, { force: true, recursive: true })
      await rm(temporary, { force: true, recursive: true })
    }
  })
})
