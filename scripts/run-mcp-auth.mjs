#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { oauthProviderResourceClient } from '@better-auth/oauth-provider/resource-client'
import { verifyBearerToken as verifyOfficialJwt } from 'better-auth/oauth2'
import { ConvexHttpClient } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'
import { chromium } from 'playwright'

import {
  MCP_FIXTURE_SCOPE,
  MCP_REMOTE_CALLBACK,
  MCP_TOOL_NAMES,
  assertNoJwtShapedValue,
  buildMcpRemoteArgs,
  buildMcpRemoteClientInfo,
  buildMcpRemoteClientMetadata,
  normalizeEvidenceOrigin,
  redactEvidenceLog,
} from './mcp-auth-contracts.mjs'
import {
  parseMcpEvidenceFixtureConfiguration,
  safeMcpFixtureChildEnvironment,
  startMcpEvidenceFixture,
} from './mcp-evidence-fixture.mjs'

const INSPECTOR_ORIGIN = 'http://localhost:6274'
const AUTH_TIMEOUT_MS = 60_000
const PROCESS_TIMEOUT_MS = 90_000
const MAX_CAPTURE_BYTES = 1024 * 1024
const SIGN_IN_RATE_LIMIT_WINDOW_MS = 10_000

function capture(stream) {
  let text = ''
  stream?.setEncoding('utf8')
  stream?.on('data', (chunk) => {
    text = (text + chunk).slice(-MAX_CAPTURE_BYTES)
  })
  return () => text
}

function safeEvidenceLog(value, secrets = []) {
  assertNoJwtShapedValue(value)
  return redactEvidenceLog(value, secrets)
}

async function waitUntil(check, description, timeout = PROCESS_TIMEOUT_MS) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const value = await check()
    if (value) return value
    await new Promise((ready) => setTimeout(ready, 100))
  }
  throw new Error(`Timed out waiting for ${description}`)
}

async function assertPortAvailable(port, host) {
  const server = createServer()
  await new Promise((ready, reject) => {
    server.once('error', reject)
    server.listen(port, host, ready)
  }).catch((error) => {
    throw new Error(`Required MCP fixture port ${host}:${port} is unavailable: ${error.message}`)
  })
  await new Promise((ready, reject) => server.close((error) => (error ? reject(error) : ready())))
}

function terminate(child, signal = 'SIGTERM') {
  if (!child.pid || child.exitCode !== null) return
  if (process.platform === 'win32') return child.kill(signal)
  try {
    process.kill(-child.pid, signal)
  } catch {
    child.kill(signal)
  }
}

async function stopProcess(child) {
  if (child.exitCode !== null) return
  terminate(child)
  const exited = await Promise.race([
    new Promise((ready) => child.once('exit', () => ready(true))),
    new Promise((ready) => setTimeout(() => ready(false), 2_000)),
  ])
  if (!exited) terminate(child, 'SIGKILL')
}

function safeChildEnvironment() {
  return safeMcpFixtureChildEnvironment()
}

function monitorBrowserPage(page, applicationOrigin) {
  const failures = []
  const location = (value) => {
    try {
      const url = new URL(value)
      return { label: `${url.origin}${url.pathname}`, origin: url.origin, pathname: url.pathname }
    } catch {
      return { label: '<invalid-url>', origin: '', pathname: '' }
    }
  }
  const isExpectedBootstrapPath = (pathname) =>
    pathname.startsWith('/_nuxt/') ||
    pathname.startsWith('/.well-known/') ||
    pathname === '/api/auth/convex/token'
  page.on('pageerror', () => {
    if (location(page.url()).origin === applicationOrigin) failures.push('pageerror')
  })
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const source = location(message.location().url)
    if (source.origin === applicationOrigin && !isExpectedBootstrapPath(source.pathname)) {
      failures.push(`console:${source.label}`)
    }
  })
  page.on('requestfailed', (request) => {
    if (request.isNavigationRequest() && request.failure()?.errorText === 'net::ERR_ABORTED') return
    const target = location(request.url())
    if (target.origin === applicationOrigin && !isExpectedBootstrapPath(target.pathname)) {
      failures.push(`request:${request.method()}:${target.label}`)
    }
  })
  page.on('response', (response) => {
    if (response.status() < 400) return
    const target = location(response.url())
    if (target.origin === applicationOrigin) {
      failures.push(`response:${response.request().method()}:${response.status()}:${target.label}`)
    }
  })
  return (label) => {
    if (failures.length > 0) {
      throw new Error(`${label} emitted unexpected browser failures: ${failures.join(', ')}`)
    }
  }
}

async function verifyDiscoveryDocuments(context, origin, resource) {
  const issuer = `${origin}/api/auth`
  const authorizationResponse = await context.request.get(
    `${origin}/.well-known/oauth-authorization-server/api/auth`,
  )
  if (authorizationResponse.status() !== 200) {
    throw new Error('OAuth authorization-server discovery was unavailable')
  }
  const authorization = await authorizationResponse.json()
  if (
    authorization.issuer !== issuer ||
    authorization.authorization_endpoint !== `${issuer}/oauth2/authorize` ||
    authorization.token_endpoint !== `${issuer}/oauth2/token` ||
    authorization.revocation_endpoint !== `${issuer}/oauth2/revoke` ||
    authorization.jwks_uri !== `${issuer}/jwks` ||
    JSON.stringify(authorization.grant_types_supported) !==
      JSON.stringify(['authorization_code']) ||
    JSON.stringify(authorization.code_challenge_methods_supported) !== JSON.stringify(['S256'])
  ) {
    throw new Error('OAuth authorization-server discovery escaped the fixed profile')
  }

  const resourceResponse = await context.request.get(
    `${origin}/.well-known/oauth-protected-resource/mcp`,
  )
  if (resourceResponse.status() !== 200) {
    throw new Error('OAuth protected-resource discovery was unavailable')
  }
  const protectedResource = await resourceResponse.json()
  if (
    protectedResource.resource !== resource ||
    JSON.stringify(protectedResource.authorization_servers) !== JSON.stringify([issuer]) ||
    JSON.stringify(protectedResource.scopes_supported) !== JSON.stringify(['mcp:read', 'mcp:write'])
  ) {
    throw new Error('OAuth protected-resource discovery escaped the fixed profile')
  }
  for (const response of [authorizationResponse, resourceResponse]) {
    if (
      response.headers()['access-control-allow-origin'] !== '*' ||
      response.headers()['set-cookie'] !== undefined
    ) {
      throw new Error('OAuth discovery response exposed credentials or non-public CORS')
    }
  }
}

async function runLocalMcpTests(root) {
  const prepared = spawnSync('pnpm', ['exec', 'nuxt-module-build', 'prepare'], {
    cwd: root,
    env: safeChildEnvironment(),
    stdio: 'inherit',
  })
  if (prepared.error) throw prepared.error
  if (prepared.status !== 0) {
    throw new Error(`MCP workspace preparation failed with exit code ${prepared.status}`)
  }
  const result = spawnSync('pnpm', ['exec', 'vitest', 'run', '--project=mcp'], {
    cwd: root,
    env: safeChildEnvironment(),
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`Local MCP security tests failed with exit code ${result.status}`)
  }
}

async function waitForInspector() {
  await waitUntil(async () => {
    try {
      const response = await fetch(INSPECTOR_ORIGIN, { redirect: 'manual' })
      await response.body?.cancel().catch(() => {})
      return response.status >= 200 && response.status < 500
    } catch {
      return false
    }
  }, 'MCP Inspector UI readiness')
}

async function readInspectorAccessToken(page) {
  try {
    return await page.evaluate(() => {
      if (typeof globalThis.__bcnMcpAccessToken === 'string') {
        return globalThis.__bcnMcpAccessToken
      }
      for (let index = 0; index < sessionStorage.length; index += 1) {
        const key = sessionStorage.key(index)
        const value = key ? sessionStorage.getItem(key) : null
        if (!value) continue
        try {
          const accessToken = JSON.parse(value)?.access_token
          if (typeof accessToken === 'string') return accessToken
        } catch {
          // Non-JSON Inspector settings cannot hold OAuth tokens.
        }
      }
      return undefined
    })
  } catch {
    // OAuth callback navigation can replace the execution context between the
    // URL read and this storage read. The next bounded poll observes it.
    return undefined
  }
}

async function completeAuthorization(
  page,
  origin,
  callback,
  {
    email: fixtureEmail,
    password: fixturePassword,
    readCapturedAccessToken,
    readOAuthFailure,
  } = {},
) {
  const expectedCallback = new URL(callback)
  const deadline = Date.now() + AUTH_TIMEOUT_MS
  let signedIn = false
  let approved = false
  while (Date.now() < deadline) {
    const current = new URL(page.url())
    const callbackReached =
      current.origin === expectedCallback.origin &&
      current.pathname === expectedCallback.pathname &&
      current.hash === expectedCallback.hash &&
      current.username === '' &&
      current.password === '' &&
      current.search.length <= 4096 &&
      [...current.searchParams.keys()].every(
        (name) =>
          ['code', 'error', 'error_description', 'error_uri', 'iss', 'state'].includes(name) &&
          current.searchParams.getAll(name).length === 1,
      )
    if (callbackReached) {
      if (current.searchParams.get('iss') !== `${origin}/api/auth`) {
        throw new Error('OAuth callback did not preserve the exact authorization issuer')
      }
      if (current.origin !== INSPECTOR_ORIGIN) return undefined
    }
    if (current.origin !== origin && current.origin !== INSPECTOR_ORIGIN) {
      throw new Error(`OAuth browser escaped the fixed fixture origins to ${current.origin}`)
    }
    if (current.origin === INSPECTOR_ORIGIN) {
      const accessToken = readCapturedAccessToken?.() ?? (await readInspectorAccessToken(page))
      if (accessToken) return accessToken
      const oauthFailure = readOAuthFailure?.()
      if (oauthFailure) throw new Error(`Inspector OAuth token exchange rejected (${oauthFailure})`)
    }

    const email = page.getByTestId('email')
    if (!signedIn && (await email.isVisible().catch(() => false))) {
      await email.fill(fixtureEmail)
      await page.getByTestId('password').fill(fixturePassword)
      await page.getByTestId('sign-in').click()
      signedIn = true
      continue
    }
    const approve = page.getByTestId('approve-consent')
    if (!approved && (await approve.isVisible().catch(() => false))) {
      await approve.click()
      approved = true
      continue
    }
    const alert = page.getByRole('alert').first()
    if (await alert.isVisible().catch(() => false)) {
      const text = (await alert.textContent())?.trim()
      throw new Error(
        text === 'Sign in failed'
          ? 'Fixture administrator sign-in failed on the OAuth login page'
          : 'Provider-signed OAuth transaction verification failed on the authorization page',
      )
    }
    await page.waitForTimeout(100)
  }
  const location = new URL(page.url())
  throw new Error(
    `Timed out completing fixture login and consent at ${location.origin}${location.pathname}`,
  )
}

function verifyInspectorTokenBindings(
  accessToken,
  { clientId, origin, resource, scope = MCP_FIXTURE_SCOPE },
) {
  let result
  try {
    const parts = accessToken.split('.')
    if (parts.length !== 3) result = { malformed: false }
    else {
      const header = decodeJwtPart(accessToken, 0)
      const claims = decodeJwtPart(accessToken, 1)
      const now = Math.floor(Date.now() / 1000)
      result = {
        algorithm: header.alg === 'RS256',
        audience: claims.aud === resource,
        claims:
          JSON.stringify(Object.keys(claims ?? {}).sort()) ===
          JSON.stringify([
            'aud',
            'azp',
            'client_id',
            'exp',
            'iat',
            'iss',
            'jti',
            'scope',
            'sid',
            'sub',
            'token_use',
          ]),
        client: claims.client_id === clientId && claims.azp === clientId,
        current:
          Number.isSafeInteger(claims.iat) &&
          Number.isSafeInteger(claims.exp) &&
          claims.iat <= now + 60 &&
          claims.exp > now &&
          claims.exp - claims.iat <= 600,
        issuer: claims.iss === `${origin}/api/auth`,
        noDpop: claims.cnf === undefined,
        scope: claims.scope === scope,
        session: typeof claims.sid === 'string' && claims.sid.length > 0,
        subject: typeof claims.sub === 'string' && claims.sub.length > 0,
        tokenClass: claims.token_use === 'oauth-access',
        type: header.typ === 'at+jwt',
      }
    }
  } catch {
    result = { malformed: false }
  }
  const failures = Object.entries(result)
    .filter(([, valid]) => valid !== true)
    .map(([name]) => name)
  if (failures.length > 0) {
    throw new Error(`Inspector received an OAuth token with invalid ${failures.join(', ')} binding`)
  }
}

function decodeJwtPart(token, index) {
  const part = token.split('.')[index]
  if (!part) throw new Error('Convex session-token response was not a compact JWT')
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
  } catch {
    throw new Error('Convex session-token response was not a compact JWT')
  }
}

async function postMcpJson(context, url, accessToken, message) {
  const response = await context.request.post(url, {
    data: message,
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${accessToken}`,
      'mcp-protocol-version': '2025-11-25',
    },
  })
  const text = await response.text()
  if (text.length > 128 * 1024) throw new Error('MCP evidence response exceeded its bound')
  let body
  try {
    body = JSON.parse(text)
  } catch {
    throw new Error(`MCP evidence response was not JSON (${response.status()})`)
  }
  return {
    allow: response.headers().allow ?? null,
    body,
    challenge: response.headers()['www-authenticate'] ?? null,
    status: response.status(),
  }
}

function assertEquivalentMcpSnapshots(proxy, direct, description) {
  if (JSON.stringify(proxy) !== JSON.stringify(direct)) {
    throw new Error(`Nuxt and direct Convex ${description} evidence diverged`)
  }
}

function requireExactToolNames(snapshot, description) {
  const names = snapshot.body?.result?.tools?.map((tool) => tool?.name)
  if (
    snapshot.status !== 200 ||
    !Array.isArray(names) ||
    JSON.stringify(names) !== JSON.stringify(MCP_TOOL_NAMES)
  ) {
    const code = typeof snapshot.body?.code === 'string' ? `:${snapshot.body.code}` : ''
    throw new Error(
      `${description} did not return the exact fixed MCP tool surface (${snapshot.status}${code})`,
    )
  }
}

async function postMcpPair(context, proxyUrl, directUrl, accessToken, message) {
  const [proxy, direct] = await Promise.all([
    postMcpJson(context, proxyUrl, accessToken, message),
    postMcpJson(context, directUrl, accessToken, message),
  ])
  return { direct, proxy }
}

function requireApplicationFailure(pair, code, description) {
  assertEquivalentMcpSnapshots(pair.proxy, pair.direct, description)
  if (
    pair.proxy.status !== 403 ||
    pair.proxy.challenge !== null ||
    JSON.stringify(pair.proxy.body) !== JSON.stringify({ code })
  ) {
    throw new Error(`${description} did not fail with ${code}`)
  }
}

function toolCall(id, name, args) {
  return {
    id,
    jsonrpc: '2.0',
    method: 'tools/call',
    params: { arguments: args, name },
  }
}

function structuredToolResult(snapshot, description) {
  const value = snapshot.body?.result?.structuredContent
  if (snapshot.status !== 200 || !value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${description} did not return a structured MCP tool result`)
  }
  return value
}

async function runWithFixtureState(set, restore, verify) {
  await set()
  try {
    await verify()
  } finally {
    await restore()
  }
}

async function assertConvexSessionToken(token, origin, convexSiteUrl) {
  if (
    typeof token !== 'string' ||
    token.length > 8192 ||
    !/^[\w-]+\.[\w-]+\.[\w-]+$/u.test(token)
  ) {
    throw new Error('Convex session-token response was not a compact JWT')
  }
  const header = decodeJwtPart(token, 0)
  const claims = decodeJwtPart(token, 1)
  const approvedClaims = ['aud', 'exp', 'iat', 'iss', 'sid', 'sub', 'token_use']
  if (
    header?.alg !== 'RS256' ||
    typeof header?.kid !== 'string' ||
    header.kid.length === 0 ||
    JSON.stringify(Object.keys(header).sort()) !== JSON.stringify(['alg', 'kid']) ||
    JSON.stringify(Object.keys(claims ?? {}).sort()) !== JSON.stringify(approvedClaims) ||
    claims.aud !== 'convex' ||
    claims.iss !== convexSiteUrl ||
    claims.token_use !== 'convex-session' ||
    typeof claims.sid !== 'string' ||
    claims.sid.length === 0 ||
    typeof claims.sub !== 'string' ||
    claims.sub.length === 0 ||
    !Number.isSafeInteger(claims.iat) ||
    !Number.isSafeInteger(claims.exp) ||
    claims.exp <= claims.iat ||
    claims.exp - claims.iat > 15 * 60
  ) {
    throw new Error('Convex session-token response had an invalid header or claim binding')
  }
  try {
    await verifyOfficialJwt(token, {
      jwksUrl: `${origin}/api/auth/jwks`,
      verifyOptions: {
        algorithms: ['RS256'],
        audience: 'convex',
        clockTolerance: 0,
        issuer: convexSiteUrl,
        maxTokenAge: '900s',
      },
    })
  } catch {
    throw new Error('Convex session-token signature did not verify against the published JWKS')
  }
}

async function provisionInteropProfile(
  context,
  origin,
  resource,
  convexSiteUrl,
  fixtureEmail,
  fixturePassword,
) {
  const requestOptions = { headers: { origin } }
  const signIn = await context.request.post(`${origin}/api/auth/sign-in/email`, {
    ...requestOptions,
    data: {
      email: fixtureEmail,
      password: fixturePassword,
    },
  })
  if (!signIn.ok()) throw new Error('MCP fixture administrator sign-in failed')

  const convexTokenResponse = await context.request.get(`${origin}/api/auth/convex/token`, {
    headers: { origin },
  })
  if (!convexTokenResponse.ok()) {
    throw new Error('Mounted OAuth provider broke authenticated Convex session-token issuance')
  }
  const convexTokenBody = await convexTokenResponse.json()
  await assertConvexSessionToken(convexTokenBody?.token, origin, convexSiteUrl)

  const response = await context.request.post(`${origin}/api/auth/mcp/admin/provision`, {
    ...requestOptions,
    data: {},
  })
  if (!response.ok()) throw new Error('MCP provider-owned interoperability provisioning failed')
  const profile = await response.json()
  const inspector = profile?.clients?.inspector
  const mcpRemote = profile?.clients?.mcpRemote
  const organizationId = profile?.organizationId
  if (
    profile?.resource !== resource ||
    typeof inspector !== 'string' ||
    inspector.length === 0 ||
    typeof mcpRemote !== 'string' ||
    mcpRemote.length === 0 ||
    inspector === mcpRemote ||
    typeof organizationId !== 'string' ||
    organizationId.length === 0
  ) {
    throw new Error('MCP interoperability profile response was invalid')
  }

  const signOut = await context.request.post(`${origin}/api/auth/sign-out`, {
    ...requestOptions,
    data: {},
  })
  if (!signOut.ok()) throw new Error('MCP fixture administrator session cleanup failed')
  await context.clearCookies()
  return { inspector, mcpRemote, organizationId }
}

async function provisionTerminalEvidence(context, origin, resource, organizationId, excludedIds) {
  const response = await context.request.post(
    `${origin}/api/auth/mcp/admin/provision-terminal-evidence`,
    { data: {}, headers: { origin } },
  )
  if (!response.ok()) throw new Error('MCP terminal evidence provisioning failed')
  const profile = await response.json()
  const clients = profile?.clients
  const keys = ['clientDelete', 'clientDisable', 'conformance', 'consentDelete', 'sessionDelete']
  const ids = keys.map((key) => clients?.[key])
  if (
    profile?.resource !== resource ||
    profile?.organizationId !== organizationId ||
    Object.keys(clients ?? {})
      .sort()
      .join(',') !== keys.sort().join(',') ||
    ids.some((id) => typeof id !== 'string' || id.length === 0) ||
    new Set([...excludedIds, ...ids]).size !== excludedIds.length + ids.length
  ) {
    throw new Error('MCP terminal evidence profile response was invalid')
  }
  return clients
}

async function chooseSelect(page, selector, option) {
  await page.locator(selector).click()
  await page.getByRole('option', { exact: true, name: option }).click()
}

async function verifyInspector({
  clientId,
  convexSiteUrl,
  context,
  email,
  inspectorToken,
  origin,
  password,
  resource,
  scope = MCP_FIXTURE_SCOPE,
}) {
  const registrationRequests = []
  let capturedAccessToken
  let inspectorToolsListDispatched = false
  context.on('request', (request) => {
    const requestUrl = new URL(request.url())
    const path = requestUrl.pathname
    if (/\/(?:oauth2\/)?register$/.test(path))
      registrationRequests.push(`${request.method()} ${path}`)
    if (requestUrl.origin !== 'http://localhost:6277' || path !== '/mcp') return
    const authorization = request.headers().authorization
    if (!authorization?.startsWith('Bearer ')) return
    const candidate = authorization.slice('Bearer '.length)
    if (/^[\w-]+\.[\w-]+\.[\w-]+$/u.test(candidate)) {
      capturedAccessToken = candidate
    }
    try {
      if (request.postDataJSON()?.method === 'tools/list') inspectorToolsListDispatched = true
    } catch {
      // Non-JSON Inspector proxy requests cannot be the tools/list evidence.
    }
  })

  const page = await context.newPage()
  const assertBrowserClean = monitorBrowserPage(page, origin)
  let tokenExchangeFailure
  const tokenEndpoint = `${origin}/api/auth/oauth2/token`
  const devtools = await context.newCDPSession(page)
  await devtools.send('DOMStorage.enable')
  const captureStoredToken = ({ newValue }) => {
    try {
      const accessToken = JSON.parse(newValue)?.access_token
      if (typeof accessToken === 'string') capturedAccessToken = accessToken
    } catch {
      // Inspector stores unrelated non-JSON settings in the same storage area.
    }
  }
  devtools.on('DOMStorage.domStorageItemAdded', captureStoredToken)
  devtools.on('DOMStorage.domStorageItemUpdated', captureStoredToken)
  page.on('response', async (response) => {
    const responseUrl = new URL(response.url())
    const responseOrigin = responseUrl.origin
    if (![origin, 'http://localhost:6277'].includes(responseOrigin)) return
    if (response.request().method() !== 'POST') return
    try {
      const payload = await response.json()
      let tokenPayload = payload
      let isTokenExchange = response.url() === tokenEndpoint
      if (responseOrigin === 'http://localhost:6277' && responseUrl.pathname === '/fetch') {
        const request = response.request().postDataJSON()
        if (request?.url !== tokenEndpoint) return
        isTokenExchange = true
        if (typeof payload?.body !== 'string' || payload.body.length > 16_384) return
        tokenPayload = JSON.parse(payload.body)
      }
      if (!isTokenExchange) return
      const accessToken = tokenPayload?.access_token
      if (typeof accessToken === 'string') capturedAccessToken = accessToken
      else if (response.status() >= 400 && response.status() <= 599) {
        const allowedErrors = new Set([
          'invalid_client',
          'invalid_grant',
          'invalid_request',
          'invalid_scope',
          'server_error',
          'temporarily_unavailable',
          'unsupported_grant_type',
        ])
        const code = allowedErrors.has(tokenPayload?.error) ? tokenPayload.error : 'oauth_error'
        tokenExchangeFailure = `${response.status()}:${code}`
      }
    } catch {
      // A malformed token response is reported by the bounded authorization loop.
    }
  })
  await page.goto(
    `${INSPECTOR_ORIGIN}/?MCP_PROXY_AUTH_TOKEN=${encodeURIComponent(inspectorToken)}`,
    { waitUntil: 'domcontentloaded' },
  )
  await chooseSelect(page, '#transport-type-select', 'Streamable HTTP')
  await page.locator('#sse-url-input').fill(resource)
  await chooseSelect(page, '#connection-type-select', 'Via Proxy')

  await page.getByTestId('auth-button').click()
  await page.getByTestId('oauth-client-id-input').fill(clientId)
  await page.getByTestId('oauth-client-secret-input').fill('')
  await page.getByTestId('oauth-scope-input').fill(scope)
  if ((await page.getByTestId('oauth-client-secret-input').inputValue()) !== '') {
    throw new Error('Inspector public-client secret field was not empty')
  }

  await page.getByTestId('config-button').click()
  await page.getByTestId('MCP_PROXY_AUTH_TOKEN-input').fill(inspectorToken)
  await page.getByRole('button', { exact: true, name: 'Connect' }).click()
  let accessToken = await completeAuthorization(
    page,
    origin,
    `${INSPECTOR_ORIGIN}/oauth/callback`,
    {
      email,
      password,
      readCapturedAccessToken: () => capturedAccessToken,
      readOAuthFailure: () => tokenExchangeFailure,
    },
  )
  if (!accessToken) throw new Error('Inspector OAuth callback did not produce an access token')
  await page.getByText('Connected', { exact: true }).waitFor({ timeout: PROCESS_TIMEOUT_MS })

  await page.getByRole('tab', { exact: true, name: 'Tools' }).click()
  await page.getByRole('button', { exact: true, name: 'List Tools' }).click()
  await waitUntil(() => inspectorToolsListDispatched, 'Inspector UI tools/list dispatch', 10_000)
  if (!capturedAccessToken) {
    throw new Error('Inspector tools/list dispatch did not carry a compact access token')
  }
  accessToken = capturedAccessToken
  verifyInspectorTokenBindings(accessToken, { clientId, origin, resource, scope })
  try {
    const verifier = oauthProviderResourceClient().getActions().verifyBearerToken
    await verifier(accessToken, {
      jwksUrl: `${origin}/api/auth/jwks`,
      verifyOptions: {
        algorithms: ['RS256'],
        audience: resource,
        clockTolerance: 0,
        issuer: `${origin}/api/auth`,
        maxTokenAge: '600s',
        typ: 'at+jwt',
      },
    })
  } catch {
    throw new Error('Inspector token failed the runner-side official resource verifier')
  }
  const toolListMessage = {
    id: 'bcn-inspector-tool-list-evidence',
    jsonrpc: '2.0',
    method: 'tools/list',
    params: {},
  }
  const directTools = await postMcpJson(
    context,
    `${convexSiteUrl}/mcp`,
    accessToken,
    toolListMessage,
  )
  const proxyTools = await postMcpJson(context, resource, accessToken, toolListMessage)
  requireExactToolNames(proxyTools, 'Inspector-bearer Nuxt tools/list')
  requireExactToolNames(directTools, 'Inspector-bearer direct Convex tools/list')
  assertEquivalentMcpSnapshots(proxyTools, directTools, 'Inspector-bearer tools/list')
  if (registrationRequests.length !== 0) {
    throw new Error(
      `Inspector attempted forbidden dynamic registration: ${registrationRequests.join(', ')}`,
    )
  }
  assertBrowserClean('MCP Inspector OAuth journey')
  await page.close()
  return accessToken
}

async function verifyRevocationProtocol(context, accessToken, clientId, origin, resource) {
  const response = await fetch(`${origin}/api/auth/oauth2/revoke`, {
    body: new URLSearchParams({
      client_id: clientId,
      token: accessToken,
      token_type_hint: 'access_token',
    }),
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      origin,
    },
    method: 'POST',
    redirect: 'manual',
  })
  const body = await response.json().catch(() => null)
  if (
    response.status !== 400 ||
    body?.error !== 'unsupported_token_type' ||
    typeof body.error_description !== 'string'
  ) {
    throw new Error(
      `OAuth JWT revocation returned an unexpected response (${response.status}, ${body?.error ?? 'no error code'})`,
    )
  }

  const stillAuthorized = await postMcpJson(context, resource, accessToken, {
    id: 'post-revoke-self-contained-token',
    jsonrpc: '2.0',
    method: 'tools/list',
    params: {},
  })
  if (stillAuthorized.status !== 200) {
    throw new Error(
      'Individual-token revocation was incorrectly treated as an immediate JWT blacklist',
    )
  }
}

async function requireProviderOperation(response, description) {
  await response.body().catch(() => undefined)
  if (!response.ok()) throw new Error(`${description} failed with ${response.status()}`)
}

async function runLiveAuthorizationParity({
  accessToken,
  clientId,
  context,
  convexSiteUrl,
  convexUrl,
  fixture,
  organizationId,
  origin,
  resource,
}) {
  const direct = `${convexSiteUrl}/mcp`
  const claims = decodeJwtPart(accessToken, 1)
  const authUserId = claims.sub
  if (typeof authUserId !== 'string' || authUserId.length === 0) {
    throw new Error('Live MCP evidence token had no subject')
  }
  const list = (id = 'bcn-live-list') => toolCall(id, 'projects.list', { organizationId })
  const create = (id, name = 'MCP parity project') =>
    toolCall(id, 'projects.create', { name, organizationId })
  const expectDenied = async (message, code, description) => {
    const pair = await postMcpPair(context, resource, direct, accessToken, message)
    requireApplicationFailure(pair, code, description)
  }
  const baseline = await postMcpPair(context, resource, direct, accessToken, list())
  assertEquivalentMcpSnapshots(baseline.proxy, baseline.direct, 'baseline live authorization')
  if (baseline.proxy.status !== 200) throw new Error('Baseline live MCP authorization failed')

  const alternateOrganizationId = await fixture.runConvex(
    'mcpAdmin:createFixtureAlternateOrganization',
    { authUserId },
  )
  if (typeof alternateOrganizationId !== 'string' || alternateOrganizationId.length === 0) {
    throw new Error('Alternate MCP fixture tenant was invalid')
  }

  const activeMembership = {
    authUserId,
    organizationId,
    role: 'owner',
    status: 'active',
  }
  await runWithFixtureState(
    () =>
      fixture.runConvex('mcpAdmin:setFixtureMembership', {
        ...activeMembership,
        status: 'removed',
      }),
    () => fixture.runConvex('mcpAdmin:setFixtureMembership', activeMembership),
    () => expectDenied(list('membership-removed'), 'MCP_ACCESS_REVOKED', 'membership removal'),
  )
  await runWithFixtureState(
    () =>
      fixture.runConvex('mcpAdmin:setFixtureMembership', {
        ...activeMembership,
        role: 'viewer',
      }),
    () => fixture.runConvex('mcpAdmin:setFixtureMembership', activeMembership),
    () => expectDenied(create('role-lowered'), 'MCP_ACCESS_REVOKED', 'role reduction'),
  )

  const activeDelegation = {
    authUserId,
    clientId,
    organizationId,
    scopes: ['mcp:read', 'mcp:write'],
    status: 'active',
  }
  await runWithFixtureState(
    () =>
      fixture.runConvex('mcpAdmin:setFixtureDelegation', {
        ...activeDelegation,
        status: 'revoked',
      }),
    () => fixture.runConvex('mcpAdmin:setFixtureDelegation', activeDelegation),
    () => expectDenied(list('delegation-revoked'), 'MCP_ACCESS_REVOKED', 'delegation revocation'),
  )
  await runWithFixtureState(
    () =>
      fixture.runConvex('mcpAdmin:setFixtureDelegation', {
        ...activeDelegation,
        scopes: ['mcp:read'],
      }),
    () => fixture.runConvex('mcpAdmin:setFixtureDelegation', activeDelegation),
    () =>
      expectDenied(create('delegation-scope'), 'MCP_SCOPE_REQUIRED', 'delegation scope removal'),
  )
  await runWithFixtureState(
    () =>
      fixture.runConvex('mcpAdmin:setFixtureDelegation', {
        ...activeDelegation,
        organizationId: alternateOrganizationId,
      }),
    () => fixture.runConvex('mcpAdmin:setFixtureDelegation', activeDelegation),
    () => expectDenied(list('tenant-changed'), 'MCP_ACCESS_REVOKED', 'delegation tenant change'),
  )
  await runWithFixtureState(
    () => fixture.runConvex('mcpAdmin:setFixtureUserActive', { active: false, authUserId }),
    () => fixture.runConvex('mcpAdmin:setFixtureUserActive', { active: true, authUserId }),
    () => expectDenied(list('user-disabled'), 'MCP_ACCESS_REVOKED', 'product capability removal'),
  )

  await runWithFixtureState(
    async () => {
      const response = await context.request.post(
        `${origin}/api/auth/mcp/admin/disable-resource-fixture`,
        { data: {}, headers: { origin } },
      )
      await requireProviderOperation(response, 'Provider resource disable')
    },
    async () => {
      const response = await context.request.post(
        `${origin}/api/auth/mcp/admin/enable-resource-fixture`,
        { data: {}, headers: { origin } },
      )
      await requireProviderOperation(response, 'Provider resource restore')
    },
    () => expectDenied(list('resource-disabled'), 'MCP_ACCESS_REVOKED', 'resource disable'),
  )

  await runWithFixtureState(
    async () => {
      const response = await context.request.post(
        `${origin}/api/auth/mcp/admin/unlink-inspector-resource-fixture`,
        { data: {}, headers: { origin } },
      )
      await requireProviderOperation(response, 'Provider client-resource unlink')
    },
    async () => {
      const response = await context.request.post(
        `${origin}/api/auth/mcp/admin/link-inspector-resource-fixture`,
        { data: {}, headers: { origin } },
      )
      await requireProviderOperation(response, 'Provider client-resource relink')
    },
    () =>
      expectDenied(list('resource-unlinked'), 'MCP_ACCESS_REVOKED', 'resource ownership unlink'),
  )

  const projectName = 'MCP destructive parity fixture'
  const [proxyCreate, directCreate] = await Promise.all([
    postMcpJson(context, resource, accessToken, create('create-proxy-project', projectName)),
    postMcpJson(context, direct, accessToken, create('create-direct-project', projectName)),
  ])
  const proxyProject = structuredToolResult(proxyCreate, 'Nuxt project create')
  const directProject = structuredToolResult(directCreate, 'direct Convex project create')
  if (
    typeof proxyProject.id !== 'string' ||
    typeof directProject.id !== 'string' ||
    proxyProject.id === directProject.id ||
    proxyProject.name !== projectName ||
    directProject.name !== projectName
  ) {
    throw new Error('Nuxt/direct project creation state changes were not equivalent')
  }

  await runWithFixtureState(
    () =>
      fixture.runConvex('mcpAdmin:setFixtureProjectOrganization', {
        authUserId,
        organizationId: alternateOrganizationId,
        projectId: proxyProject.id,
      }),
    () =>
      fixture.runConvex('mcpAdmin:setFixtureProjectOrganization', {
        authUserId,
        organizationId,
        projectId: proxyProject.id,
      }),
    () =>
      expectDenied(
        toolCall('project-owner-changed', 'projects.delete.preview', {
          organizationId,
          projectId: proxyProject.id,
        }),
        'MCP_RESOURCE_NOT_FOUND',
        'project resource ownership change',
      ),
  )

  const [proxyPreview, directPreview] = await Promise.all([
    postMcpJson(
      context,
      resource,
      accessToken,
      toolCall('preview-proxy', 'projects.delete.preview', {
        organizationId,
        projectId: proxyProject.id,
      }),
    ),
    postMcpJson(
      context,
      direct,
      accessToken,
      toolCall('preview-direct', 'projects.delete.preview', {
        organizationId,
        projectId: directProject.id,
      }),
    ),
  ])
  const normalizedPreview = (snapshot, description) => {
    const value = structuredToolResult(snapshot, description)
    return {
      name: value.project?.name,
      operation: value.operation,
      requiresApproval: value.requiresApproval,
      reversible: value.reversible,
      status: value.status,
    }
  }
  if (
    JSON.stringify(normalizedPreview(proxyPreview, 'Nuxt deletion preview')) !==
    JSON.stringify(normalizedPreview(directPreview, 'direct Convex deletion preview'))
  ) {
    throw new Error('Nuxt/direct destructive preview evidence diverged')
  }

  const [proxyApprovalResponse, directApprovalResponse] = await Promise.all([
    postMcpJson(
      context,
      resource,
      accessToken,
      toolCall('approval-proxy', 'projects.delete.requestApproval', {
        organizationId,
        projectId: proxyProject.id,
      }),
    ),
    postMcpJson(
      context,
      direct,
      accessToken,
      toolCall('approval-direct', 'projects.delete.requestApproval', {
        organizationId,
        projectId: directProject.id,
      }),
    ),
  ])
  const proxyApproval = structuredToolResult(proxyApprovalResponse, 'Nuxt approval request')
  const directApproval = structuredToolResult(directApprovalResponse, 'direct approval request')
  if (
    typeof proxyApproval.approvalId !== 'string' ||
    typeof directApproval.approvalId !== 'string' ||
    proxyApproval.approvalId === directApproval.approvalId ||
    proxyApproval.status !== 'waiting_for_approval' ||
    directApproval.status !== 'waiting_for_approval'
  ) {
    throw new Error('Nuxt/direct approval-request state changes were not equivalent')
  }

  const execute = (id, projectId, approvalId) =>
    toolCall(id, 'projects.delete.execute', { approvalId, organizationId, projectId })
  const [proxyBlocked, directBlocked] = await Promise.all([
    postMcpJson(
      context,
      resource,
      accessToken,
      execute('execute-unapproved-proxy', proxyProject.id, proxyApproval.approvalId),
    ),
    postMcpJson(
      context,
      direct,
      accessToken,
      execute('execute-unapproved-direct', directProject.id, directApproval.approvalId),
    ),
  ])
  if (
    JSON.stringify({ ...proxyBlocked, body: proxyBlocked.body }) !==
      JSON.stringify({ ...directBlocked, body: directBlocked.body }) ||
    proxyBlocked.status !== 403 ||
    proxyBlocked.body?.code !== 'MCP_APPROVAL_REQUIRED'
  ) {
    throw new Error('Nuxt/direct unapproved destructive operation evidence diverged')
  }

  const convexTokenResponse = await context.request.get(`${origin}/api/auth/convex/token`, {
    headers: { origin },
  })
  if (!convexTokenResponse.ok()) throw new Error('Human approval session-token issuance failed')
  const convexToken = (await convexTokenResponse.json())?.token
  await assertConvexSessionToken(convexToken, origin, convexSiteUrl)
  const convex = new ConvexHttpClient(convexUrl)
  convex.setAuth(convexToken)
  const approve = makeFunctionReference('approvals:approveProjectDelete')
  await Promise.all([
    convex.mutation(approve, { approvalId: proxyApproval.approvalId }),
    convex.mutation(approve, { approvalId: directApproval.approvalId }),
  ])

  const [proxyExecuted, directExecuted] = await Promise.all([
    postMcpJson(
      context,
      resource,
      accessToken,
      execute('execute-approved-proxy', proxyProject.id, proxyApproval.approvalId),
    ),
    postMcpJson(
      context,
      direct,
      accessToken,
      execute('execute-approved-direct', directProject.id, directApproval.approvalId),
    ),
  ])
  const proxyExecution = structuredToolResult(proxyExecuted, 'Nuxt approved deletion')
  const directExecution = structuredToolResult(directExecuted, 'direct approved deletion')
  if (proxyExecution.status !== 'deleted' || directExecution.status !== 'deleted') {
    throw new Error('Nuxt/direct approved deletion state changes were not equivalent')
  }

  const state = await fixture.runConvex('mcpAdmin:readFixtureDestructiveState', {
    approvalIds: [proxyApproval.approvalId, directApproval.approvalId],
    projectIds: [proxyProject.id, directProject.id],
  })
  const expectedProjects = [
    { exists: true, hasDeletedAt: true, status: 'deleted' },
    { exists: true, hasDeletedAt: true, status: 'deleted' },
  ]
  const expectedApprovals = [
    { exists: true, hasUsedAt: true, status: 'used' },
    { exists: true, hasUsedAt: true, status: 'used' },
  ]
  if (
    JSON.stringify(state?.projects) !== JSON.stringify(expectedProjects) ||
    JSON.stringify(state?.approvals) !== JSON.stringify(expectedApprovals)
  ) {
    throw new Error('Soft-delete reversibility or single-use approval evidence was invalid')
  }
}

async function runTerminalRevocationParity({
  browser,
  clients,
  convexSiteUrl,
  email,
  inspectorToken,
  organizationId,
  origin,
  password,
  resource,
}) {
  const direct = `${convexSiteUrl}/mcp`
  const seenTokens = new Set()
  const seenSessions = new Set()
  const seenTokenIds = new Set()
  const acquire = async (clientId, scope = MCP_FIXTURE_SCOPE) => {
    const context = await browser.newContext({ viewport: { height: 900, width: 1440 } })
    try {
      const accessToken = await verifyInspector({
        clientId,
        convexSiteUrl,
        context,
        email,
        inspectorToken,
        origin,
        password,
        resource,
        scope,
      })
      const claims = decodeJwtPart(accessToken, 1)
      if (
        claims.client_id !== clientId ||
        typeof claims.sid !== 'string' ||
        typeof claims.jti !== 'string' ||
        seenTokens.has(accessToken) ||
        seenSessions.has(claims.sid) ||
        seenTokenIds.has(claims.jti)
      ) {
        throw new Error('Terminal evidence reused an OAuth token, session, or transaction result')
      }
      seenTokens.add(accessToken)
      seenSessions.add(claims.sid)
      seenTokenIds.add(claims.jti)
      const baseline = await postMcpPair(
        context,
        resource,
        direct,
        accessToken,
        toolCall(`terminal-baseline-${seenTokens.size}`, 'projects.list', { organizationId }),
      )
      assertEquivalentMcpSnapshots(
        baseline.proxy,
        baseline.direct,
        'terminal-case baseline authorization',
      )
      if (baseline.proxy.status !== 200) {
        throw new Error('Fresh terminal-case OAuth transaction was not live-authorized')
      }
      return { accessToken, context }
    } catch (error) {
      await context.close().catch(() => {})
      throw error
    }
  }
  const requireRevoked = async (evidence, description) => {
    const pair = await postMcpPair(
      evidence.context,
      resource,
      direct,
      evidence.accessToken,
      toolCall(`terminal-${description}`, 'projects.list', { organizationId }),
    )
    requireApplicationFailure(pair, 'MCP_ACCESS_REVOKED', description)
  }
  const postAdminTransition = async (context, path, description) => {
    const response = await context.request.post(`${origin}/api/auth/mcp/admin/${path}`, {
      data: {},
      headers: { origin },
    })
    await requireProviderOperation(response, description)
  }

  const session = await acquire(clients.sessionDelete)
  try {
    const signOut = await session.context.request.post(`${origin}/api/auth/sign-out`, {
      data: {},
      headers: { origin },
    })
    await requireProviderOperation(signOut, 'Persisted Better Auth session deletion')
    await requireRevoked(session, 'session deletion')
  } finally {
    await session.context.close().catch(() => {})
  }

  const disabledClient = await acquire(clients.clientDisable)
  try {
    await postAdminTransition(
      disabledClient.context,
      'disable-client-fixture',
      'Persisted OAuth client disable',
    )
    await requireRevoked(disabledClient, 'client disable')
  } finally {
    await disabledClient.context.close().catch(() => {})
  }

  const deletedClient = await acquire(clients.clientDelete)
  try {
    await postAdminTransition(
      deletedClient.context,
      'delete-client-fixture',
      'Persisted OAuth client deletion',
    )
    await requireRevoked(deletedClient, 'client deletion')
  } finally {
    await deletedClient.context.close().catch(() => {})
  }

  // The pinned Better Auth rule permits three sign-ins per 10-second window.
  // Keep the canonical limiter enabled and pace the remaining fresh sessions.
  await new Promise((ready) => setTimeout(ready, SIGN_IN_RATE_LIMIT_WINDOW_MS + 100))

  const deletedConsent = await acquire(clients.consentDelete)
  try {
    await postAdminTransition(
      deletedConsent.context,
      'delete-consent-fixture',
      'Persisted OAuth consent/grant deletion',
    )
    await requireRevoked(deletedConsent, 'consent deletion')
  } finally {
    await deletedConsent.context.close().catch(() => {})
  }

  return await acquire(clients.conformance, 'mcp:read')
}

function extractAuthorizationUrl(log) {
  const marker = 'Please authorize this client by visiting:'
  const index = log.lastIndexOf(marker)
  if (index === -1) return undefined
  return log.slice(index + marker.length).match(/https?:\/\/\S+/)?.[0]
}

function jsonRpcReader(stream) {
  const messages = []
  let pending = ''
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    pending += chunk
    while (pending.includes('\n')) {
      const index = pending.indexOf('\n')
      const line = pending.slice(0, index).trim()
      pending = pending.slice(index + 1)
      if (!line) continue
      try {
        const parsed = JSON.parse(line)
        if (parsed && typeof parsed === 'object') messages.push(parsed)
      } catch {
        // mcp-remote reserves stdout for JSON-RPC. Non-JSON output is retained
        // by the process capture and causes the expected response to time out.
      }
    }
  })
  return async (id) =>
    waitUntil(() => {
      const index = messages.findIndex((message) => message.id === id)
      return index === -1 ? undefined : messages.splice(index, 1)[0]
    }, `mcp-remote JSON-RPC response ${id}`)
}

async function createBrowserOpenShim(directory) {
  const path = join(directory, process.platform === 'win32' ? 'open.cmd' : 'open')
  const source = process.platform === 'win32' ? '@exit /b 0\r\n' : '#!/bin/sh\nexit 0\n'
  await writeFile(path, source, { mode: 0o700 })
  await chmod(path, 0o700)
  return path
}

async function verifyMcpRemote({ clientId, context, email, origin, password, resource, tempRoot }) {
  const remoteRoot = join(tempRoot, 'mcp-remote')
  await chmod(tempRoot, 0o700)
  await mkdtemp(`${remoteRoot}-`).then(async (directory) => {
    await chmod(directory, 0o700)
    const configDirectory = join(directory, 'config')
    const infoPath = join(directory, 'client-info.json')
    const metadataPath = join(directory, 'client-metadata.json')
    const shimDirectory = join(directory, 'bin')
    await Promise.all([
      mkdir(configDirectory, { mode: 0o700 }),
      mkdir(shimDirectory, { mode: 0o700 }),
    ])
    await writeFile(infoPath, JSON.stringify(buildMcpRemoteClientInfo(clientId)), { mode: 0o600 })
    await writeFile(metadataPath, JSON.stringify(buildMcpRemoteClientMetadata()), { mode: 0o600 })
    const shim = await createBrowserOpenShim(shimDirectory)

    const env = {
      ...safeChildEnvironment(),
      BROWSER: shim,
      MCP_REMOTE_CONFIG_DIR: configDirectory,
      PATH: `${shimDirectory}:${process.env.PATH ?? ''}`,
    }
    const child = spawn('pnpm', buildMcpRemoteArgs(resource, infoPath, metadataPath), {
      cwd: process.cwd(),
      detached: process.platform !== 'win32',
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const stdoutLog = capture(child.stdout)
    const stderrLog = capture(child.stderr)
    const responseFor = jsonRpcReader(child.stdout)
    try {
      const authorizationUrl = await waitUntil(() => {
        if (child.exitCode !== null) {
          throw new Error(`mcp-remote exited before OAuth (${child.exitCode})`)
        }
        return extractAuthorizationUrl(stderrLog())
      }, 'mcp-remote authorization URL')
      const authorization = new URL(authorizationUrl)
      if (
        authorization.origin !== origin ||
        authorization.searchParams.get('resource') !== resource
      ) {
        throw new Error(
          'mcp-remote authorization request escaped the fixed issuer/resource topology',
        )
      }
      if (authorization.searchParams.get('client_id') !== clientId) {
        throw new Error('mcp-remote did not use the preregistered public client')
      }
      const page = await context.newPage()
      const assertBrowserClean = monitorBrowserPage(page, origin)
      await page.goto(authorization.href, { waitUntil: 'domcontentloaded' })
      await completeAuthorization(page, origin, MCP_REMOTE_CALLBACK, { email, password })
      assertBrowserClean('mcp-remote OAuth journey')
      await page.close()

      await waitUntil(
        () => stderrLog().includes('Proxy established successfully'),
        'mcp-remote connection',
      )
      child.stdin.write(
        `${JSON.stringify({
          id: 1,
          jsonrpc: '2.0',
          method: 'initialize',
          params: {
            capabilities: {},
            clientInfo: { name: 'bcn-mcp-remote-evidence', version: '1.0.0' },
            protocolVersion: '2025-11-25',
          },
        })}\n`,
      )
      const initialized = await responseFor(1)
      if (initialized.error || initialized.result?.protocolVersion !== '2025-11-25') {
        throw new Error('mcp-remote initialization did not negotiate MCP 2025-11-25')
      }
      child.stdin.write(
        `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })}\n`,
      )
      child.stdin.write(
        `${JSON.stringify({ id: 2, jsonrpc: '2.0', method: 'tools/list', params: {} })}\n`,
      )
      const listed = await responseFor(2)
      const names = listed.result?.tools?.map((tool) => tool.name)
      if (!Array.isArray(names) || MCP_TOOL_NAMES.some((name) => !names.includes(name))) {
        throw new Error('mcp-remote did not observe the fixed MCP tool surface')
      }
      safeEvidenceLog(`${stderrLog()}\n${stdoutLog()}`)
    } catch (error) {
      const logs = safeEvidenceLog(`${stderrLog()}\n${stdoutLog()}`)
      throw new Error(`${error instanceof Error ? error.message : String(error)}\n${logs}`, {
        cause: error,
      })
    } finally {
      child.stdin.end()
      await stopProcess(child)
      await rm(directory, { force: true, recursive: true })
    }
  })
}

export async function runMcpEvidence({ conformanceRunner, includeConformance = false } = {}) {
  if (includeConformance && typeof conformanceRunner !== 'function') {
    throw new Error('Self-contained MCP conformance requires the dedicated conformance runner')
  }
  const root = process.cwd()
  parseMcpEvidenceFixtureConfiguration()
  await runLocalMcpTests(root)
  const fixture = await startMcpEvidenceFixture()
  try {
    const origin = normalizeEvidenceOrigin(fixture.origin)
    const convexSiteUrl = normalizeEvidenceOrigin(fixture.convexSiteUrl)
    const resource = `${origin}/mcp`
    await Promise.all([
      assertPortAvailable(3334, '127.0.0.1'),
      assertPortAvailable(6274, 'localhost'),
      assertPortAvailable(6277, 'localhost'),
    ])

    const tempRoot = await mkdtemp(join(tmpdir(), 'bcn-mcp-auth-'))
    await chmod(tempRoot, 0o700)
    const inspectorToken = randomBytes(32).toString('base64url')
    const inspector = spawn('pnpm', ['exec', 'mcp-inspector'], {
      cwd: root,
      detached: process.platform !== 'win32',
      env: {
        ...safeChildEnvironment(),
        CLIENT_PORT: '6274',
        HOST: 'localhost',
        MCP_AUTO_OPEN_ENABLED: 'false',
        MCP_PROXY_AUTH_TOKEN: inspectorToken,
        SERVER_PORT: '6277',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const inspectorStdout = capture(inspector.stdout)
    const inspectorStderr = capture(inspector.stderr)
    let browser
    let context
    try {
      await waitForInspector()
      browser = await chromium.launch({ headless: true })
      context = await browser.newContext({ viewport: { height: 900, width: 1440 } })
      await verifyDiscoveryDocuments(context, origin, resource)
      const clients = await provisionInteropProfile(
        context,
        origin,
        resource,
        convexSiteUrl,
        fixture.email,
        fixture.password,
      )
      const inspectorAccessToken = await verifyInspector({
        clientId: clients.inspector,
        convexSiteUrl,
        context,
        email: fixture.email,
        inspectorToken,
        origin,
        password: fixture.password,
        resource,
      })
      await verifyMcpRemote({
        clientId: clients.mcpRemote,
        context,
        email: fixture.email,
        origin,
        password: fixture.password,
        resource,
        tempRoot,
      })
      await runLiveAuthorizationParity({
        accessToken: inspectorAccessToken,
        clientId: clients.inspector,
        context,
        convexSiteUrl,
        convexUrl: fixture.convexUrl,
        fixture,
        organizationId: clients.organizationId,
        origin,
        resource,
      })
      await verifyRevocationProtocol(
        context,
        inspectorAccessToken,
        clients.inspector,
        origin,
        resource,
      )
      const terminalClients = await provisionTerminalEvidence(
        context,
        origin,
        resource,
        clients.organizationId,
        [clients.inspector, clients.mcpRemote],
      )
      const conformance = await runTerminalRevocationParity({
        browser,
        clients: terminalClients,
        convexSiteUrl,
        email: fixture.email,
        inspectorToken,
        organizationId: clients.organizationId,
        origin,
        password: fixture.password,
        resource,
      })
      try {
        if (includeConformance) {
          await conformanceRunner({ bearer: conformance.accessToken, origin, root })
        }
      } finally {
        await conformance.context.close().catch(() => {})
      }
      safeEvidenceLog(`${inspectorStderr()}\n${inspectorStdout()}`, [
        inspectorToken,
        fixture.email,
        fixture.password,
      ])
      console.log(
        `MCP OAuth interoperability, live Nuxt/direct parity, and terminal revocation passed${includeConformance ? ' with server conformance' : ''}.`,
      )
    } catch (error) {
      const logs = safeEvidenceLog(`${inspectorStderr()}\n${inspectorStdout()}`, [
        inspectorToken,
        fixture.email,
        fixture.password,
      ])
      throw new Error(`${error instanceof Error ? error.message : String(error)}\n${logs}`, {
        cause: error,
      })
    } finally {
      await browser?.close().catch(() => {})
      await stopProcess(inspector)
      await rm(tempRoot, { force: true, recursive: true })
    }
  } finally {
    await fixture.release()
  }
}

export async function main() {
  await runMcpEvidence()
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
