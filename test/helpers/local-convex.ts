import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { assertCurrentBackendBinary } from '../../scripts/check-auth-backend.mjs'

interface LocalConvexHandle {
  authOrigin: string
  cwd: string
  deploymentEnv: Readonly<Record<string, string>>
  process: ChildProcessWithoutNullStreams
  url: string
  siteUrl: string
}

interface LocalConvexEnv {
  url?: string
  siteUrl?: string
}

export interface EnsureLocalConvexResult {
  env: Record<string, string>
  release: () => Promise<void>
}

export interface EnsureLocalConvexOptions {
  authOrigin?: string
  cwd?: string
  deploymentEnv?: Readonly<Record<string, string>>
  timeoutMs?: number
}

export interface LocalAuthPreflightOptions {
  cwd?: string
  env?: Record<string, string>
  origin?: string
  timeoutMs?: number
}

let activeHandle: LocalConvexHandle | null = null
let retainers = 0
const startupFailures = new Map<string, Error>()
const convexCli = fileURLToPath(new URL('../../node_modules/convex/bin/main.js', import.meta.url))
const localAuthSecret = '1:better-convex-nuxt-e2e-only-secret-32-bytes-minimum'
const localProxyIpSecret = 'better-convex-nuxt-e2e-proxy-ip-secret-32-bytes'
const maxLocalDeploymentEnvEntries = 16
const maxLocalDeploymentEnvValueBytes = 4096
const reservedLocalDeploymentEnvNames = new Set([
  'BCN_AUTH_PROXY_IP_SECRET',
  'BETTER_AUTH_SECRETS',
  'CONVEX_DEPLOYMENT',
  'CONVEX_SITE_URL',
  'CONVEX_URL',
  'NUXT_PUBLIC_CONVEX_SITE_URL',
  'NUXT_PUBLIC_CONVEX_URL',
  'SITE_URL',
])

function startupKey(
  cwd: string,
  url: string,
  deploymentEnv: Readonly<Record<string, string>>,
): string {
  return `${cwd}:${url}:${JSON.stringify(deploymentEnv)}`
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

function cacheStartupFailure(key: string, error: unknown): Error {
  const normalized = toError(error)
  startupFailures.set(key, normalized)
  return normalized
}

function installLocalConvexEnv(env: Record<string, string>): Record<string, string> {
  Object.assign(process.env, env)
  return env
}

function createChildOutputReader(child: ChildProcessWithoutNullStreams): () => string {
  const chunks: string[] = []
  const maxLength = 4000

  const append = (data: Buffer | string) => {
    chunks.push(data.toString())

    let length = chunks.reduce((total, chunk) => total + chunk.length, 0)
    while (length > maxLength && chunks.length > 1) {
      const removed = chunks.shift()
      length -= removed?.length ?? 0
    }
  }

  child.stdout.on('data', append)
  child.stderr.on('data', append)

  return () => {
    const output = chunks.join('').replace(/\r/g, '').trim()
    if (!output) return '(no output captured)'
    return output.length > maxLength ? output.slice(-maxLength) : output
  }
}

async function terminateChild(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return

  child.kill('SIGTERM')

  const timer = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL')
    }
  }, 3000)

  await once(child, 'exit').catch(() => {})
  clearTimeout(timer)
}

function spawnConvex(cwd: string, args: string[]): ChildProcessWithoutNullStreams {
  return spawn(process.execPath, [convexCli, ...args], {
    cwd,
    env: process.env,
    stdio: 'pipe',
  })
}

async function setLocalConvexEnvironment(cwd: string, name: string, value: string): Promise<void> {
  const maxAttempts = 5
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const child = spawnConvex(cwd, ['env', 'set', name, value, '--env-file', '.env.local'])
    const getOutput = createChildOutputReader(child)
    const [code] = await once(child, 'exit')
    if (code === 0) return

    const output = getOutput()
    const transient = output.includes('OptimisticConcurrencyControlFailure')
    if (!transient || attempt === maxAttempts) {
      throw new Error(`Failed to configure local Convex ${name}: ${output}`)
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 100))
  }
}

async function configureLocalAuthEnvironment(
  cwd: string,
  authOrigin: string,
  deploymentEnv: Readonly<Record<string, string>>,
): Promise<void> {
  await setLocalConvexEnvironment(cwd, 'SITE_URL', authOrigin)
  await setLocalConvexEnvironment(cwd, 'BETTER_AUTH_SECRETS', localAuthSecret)
  await setLocalConvexEnvironment(cwd, 'BCN_AUTH_PROXY_IP_SECRET', localProxyIpSecret)
  for (const [name, value] of Object.entries(deploymentEnv)) {
    await setLocalConvexEnvironment(cwd, name, value)
  }
  process.env.BCN_AUTH_PROXY_IP_SECRET = localProxyIpSecret
}

async function readLocalConvexEnv(cwd: string): Promise<LocalConvexEnv> {
  try {
    const envPath = path.join(cwd, '.env.local')
    const content = await readFile(envPath, 'utf-8')
    const lines = content.split('\n')

    const values: Record<string, string> = {}
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue

      const [rawKey, ...rest] = trimmed.split('=')
      if (!rawKey || rest.length === 0) continue

      const key = rawKey.trim()
      const rawValue = rest.join('=').trim()
      const value = rawValue.split('#')[0]?.trim()
      if (!value) continue

      values[key] = value
    }

    return {
      url: values.CONVEX_URL,
      siteUrl: values.CONVEX_SITE_URL,
    }
  } catch {
    return {}
  }
}

function deriveSiteUrlFromConvexUrl(urlString: string): string | null {
  try {
    const url = new URL(urlString)
    if ((url.hostname === '127.0.0.1' || url.hostname === 'localhost') && url.port) {
      const port = Number.parseInt(url.port, 10)
      if (!Number.isNaN(port)) {
        url.port = String(port + 1)
        return url.toString().replace(/\/$/, '')
      }
    }
    return null
  } catch {
    return null
  }
}

function localPortFromUrl(urlString: string): number | null {
  try {
    const url = new URL(urlString)
    const isLoopback =
      url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]'
    if (!isLoopback || !url.port) return null

    const port = Number.parseInt(url.port, 10)
    return Number.isNaN(port) ? null : port
  } catch {
    return null
  }
}

function isLoopbackUrl(urlString: string): boolean {
  try {
    const { hostname } = new URL(urlString)
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]'
  } catch {
    return false
  }
}

function normalizeLocalAuthOrigin(origin: string): string {
  const url = new URL(origin)
  if (
    url.protocol !== 'http:' ||
    !isLoopbackUrl(origin) ||
    !url.port ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(`Local Convex auth origin must be a plain loopback HTTP origin: ${origin}`)
  }
  return url.origin
}

function normalizeLocalDeploymentEnv(
  deploymentEnv: Readonly<Record<string, string>> | undefined,
): Readonly<Record<string, string>> {
  if (deploymentEnv === undefined) return Object.freeze({})
  if (deploymentEnv === null || typeof deploymentEnv !== 'object' || Array.isArray(deploymentEnv)) {
    throw new TypeError('Local Convex deploymentEnv must be a record of environment variables.')
  }

  const entries = Object.entries(deploymentEnv).sort(([left], [right]) => left.localeCompare(right))
  if (entries.length > maxLocalDeploymentEnvEntries) {
    throw new RangeError(
      `Local Convex deploymentEnv cannot contain more than ${maxLocalDeploymentEnvEntries} entries.`,
    )
  }

  for (const [name, value] of entries) {
    if (!/^[A-Z][A-Z0-9_]{0,63}$/u.test(name)) {
      throw new TypeError(`Invalid local Convex deployment environment variable name: ${name}`)
    }
    if (reservedLocalDeploymentEnvNames.has(name)) {
      throw new TypeError(`Local Convex deploymentEnv cannot override harness-owned ${name}.`)
    }
    if (typeof value !== 'string') {
      throw new TypeError(`Local Convex deployment environment variable ${name} must be a string.`)
    }
    const size = Buffer.byteLength(value, 'utf8')
    if (size === 0 || size > maxLocalDeploymentEnvValueBytes || value.includes('\0')) {
      throw new RangeError(
        `Local Convex deployment environment variable ${name} must contain 1-${maxLocalDeploymentEnvValueBytes} UTF-8 bytes without NUL.`,
      )
    }
  }

  return Object.freeze(Object.fromEntries(entries))
}

function localDeploymentEnvMatches(
  left: Readonly<Record<string, string>>,
  right: Readonly<Record<string, string>>,
): boolean {
  const leftEntries = Object.entries(left)
  const rightEntries = Object.entries(right)
  return (
    leftEntries.length === rightEntries.length &&
    leftEntries.every(([name, value], index) => {
      const rightEntry = rightEntries[index]
      return rightEntry?.[0] === name && rightEntry[1] === value
    })
  )
}

function buildManualAuthSetupHelp(cwd: string): string {
  return [
    '[e2e][auth-loop] Local Better Auth setup is incomplete.',
    'With `pnpm exec convex dev` running in another terminal, run:',
    `  cd ${cwd}`,
    '  pnpm exec convex env set SITE_URL http://localhost:3050 --env-file .env.local',
    '  # CONVEX_SITE_URL is supplied by the selected Convex deployment.',
    '  pnpm exec convex env set BETTER_AUTH_SECRETS 1:<strong-random-secret> --env-file .env.local',
    '  pnpm exec convex env set BCN_AUTH_PROXY_IP_SECRET <separate-strong-random-secret> --env-file .env.local',
    '  cd .. && pnpm test:e2e',
  ].join('\n')
}

function buildLocalConvexSetupHelp(cwd: string): string {
  return [
    '[e2e] Local Convex backend is not configured.',
    'Either export CONVEX_URL and CONVEX_SITE_URL, or run:',
    `  cd ${cwd}`,
    '  pnpm exec convex dev',
    '  cd .. && pnpm test:e2e',
    'To let the e2e helper spawn `pnpm exec convex dev`, set CONVEX_E2E_AUTO_START=true.',
  ].join('\n')
}

function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const started = Date.now()

  return new Promise((resolve, reject) => {
    const check = () => {
      const socket = new net.Socket()
      socket.setTimeout(500)
      socket.once('connect', () => {
        socket.destroy()
        resolve()
      })
      socket.once('timeout', () => {
        socket.destroy()
        retry()
      })
      socket.once('error', () => {
        socket.destroy()
        retry()
      })
      socket.connect(port, '127.0.0.1')
    }

    const retry = () => {
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`Timed out waiting for local Convex backend on port ${port}`))
        return
      }
      setTimeout(check, 100)
    }

    check()
  })
}

async function waitForLocalConvexStart(
  child: ChildProcessWithoutNullStreams,
  cwd: string,
  timeoutMs: number,
  getOutput: () => string,
): Promise<{ url: string; siteUrl: string }> {
  const started = Date.now()

  while (Date.now() - started <= timeoutMs) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(
        [
          'Local Convex exited before its configured backend became reachable.',
          `- exit code: ${child.exitCode ?? 'none'}`,
          `- signal: ${child.signalCode ?? 'none'}`,
          'Captured Convex output:',
          getOutput(),
        ].join('\n'),
      )
    }

    const selected = await readLocalConvexEnv(cwd)
    if (selected.url) {
      const siteUrl = selected.siteUrl ?? deriveSiteUrlFromConvexUrl(selected.url)
      const port = localPortFromUrl(selected.url)
      if (siteUrl && port !== null) {
        try {
          await waitForPort(port, 500)
          return { url: selected.url, siteUrl }
        } catch {
          // The CLI writes .env.local before the backend is ready. Keep polling.
        }
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  throw new Error(
    [
      `Timed out waiting for Convex to configure and start its local deployment after ${timeoutMs}ms.`,
      '',
      'Captured Convex output:',
      getOutput(),
    ].join('\n'),
  )
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

function sanitizeBodyPreview(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 240)
}

export async function assertLocalAuthReady(options: LocalAuthPreflightOptions = {}): Promise<void> {
  const cwd = options.cwd ?? path.resolve(process.cwd(), 'playground')
  const timeoutMs = options.timeoutMs ?? 5000
  const envFile = await readLocalConvexEnv(cwd)
  const mergedEnv = options.env ?? {}

  const convexUrl = mergedEnv.CONVEX_URL ?? process.env.CONVEX_URL ?? envFile.url
  const siteUrl =
    mergedEnv.CONVEX_SITE_URL ??
    process.env.CONVEX_SITE_URL ??
    envFile.siteUrl ??
    (convexUrl ? (deriveSiteUrlFromConvexUrl(convexUrl) ?? undefined) : undefined)

  if (!convexUrl || !siteUrl) {
    const missing = [!convexUrl ? 'CONVEX_URL' : null, !siteUrl ? 'CONVEX_SITE_URL' : null]
      .filter(Boolean)
      .join(', ')

    throw new Error(
      [
        `[e2e][auth-loop] Missing required local Convex env values: ${missing}.`,
        `- resolved CONVEX_URL: ${convexUrl ?? 'missing'}`,
        `- resolved CONVEX_SITE_URL: ${siteUrl ?? 'missing'}`,
        buildManualAuthSetupHelp(cwd),
      ].join('\n'),
    )
  }

  const origin = options.origin ?? 'http://localhost:3050'
  const originUrl = new URL(origin)
  const getSessionEndpoint = `${siteUrl.replace(/\/$/, '')}/api/auth/get-session`

  let response: Response
  try {
    response = await fetchWithTimeout(
      getSessionEndpoint,
      {
        method: 'GET',
        headers: {
          origin,
          'x-forwarded-host': originUrl.host,
          'x-forwarded-proto': originUrl.protocol.slice(0, -1),
        },
        redirect: 'manual',
      },
      timeoutMs,
    )
  } catch (error) {
    throw new Error(
      [
        `[e2e][auth-loop] Could not reach Better Auth endpoint: ${getSessionEndpoint}`,
        `- cause: ${error instanceof Error ? error.message : String(error)}`,
        buildManualAuthSetupHelp(cwd),
      ].join('\n'),
      { cause: error },
    )
  }

  if (response.status === 404) {
    throw new Error(
      [
        `[e2e][auth-loop] Better Auth HTTP route returned 404 at ${getSessionEndpoint}.`,
        '- likely cause: Better Auth routes are not registered on the local Convex site URL.',
        buildManualAuthSetupHelp(cwd),
      ].join('\n'),
    )
  }

  if (response.status === 403) {
    const body = sanitizeBodyPreview(await response.text())
    throw new Error(
      [
        `[e2e][auth-loop] Better Auth origin validation failed (403) at ${getSessionEndpoint}.`,
        `- attempted origin: ${origin}`,
        `- response: ${body || '(empty body)'}`,
        `- likely cause: SITE_URL/trusted origins do not include ${origin}.`,
        buildManualAuthSetupHelp(cwd),
      ].join('\n'),
    )
  }

  if (response.status >= 500) {
    const body = sanitizeBodyPreview(await response.text())
    throw new Error(
      [
        `[e2e][auth-loop] Better Auth endpoint returned ${response.status} at ${getSessionEndpoint}.`,
        `- response: ${body || '(empty body)'}`,
        '- likely cause: missing/invalid BETTER_AUTH_SECRETS, CONVEX_SITE_URL, or local auth component setup.',
        buildManualAuthSetupHelp(cwd),
      ].join('\n'),
    )
  }
}

function installResolvedLocalEnv(url: string, siteUrl: string): Record<string, string> {
  return installLocalConvexEnv({
    CONVEX_URL: url,
    NUXT_PUBLIC_CONVEX_URL: url,
    CONVEX_SITE_URL: siteUrl,
    NUXT_PUBLIC_CONVEX_SITE_URL: siteUrl,
  })
}

async function waitForLocalAuthDeployment(
  cwd: string,
  url: string,
  siteUrl: string,
  timeoutMs: number,
  authOrigin: string,
  getOutput?: () => string,
): Promise<void> {
  const started = Date.now()
  let lastError: unknown

  while (Date.now() - started <= timeoutMs) {
    try {
      await assertLocalAuthReady({
        cwd,
        env: { CONVEX_SITE_URL: siteUrl, CONVEX_URL: url },
        origin: authOrigin,
        timeoutMs: 1000,
      })
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }

  throw new Error(
    [
      `Timed out waiting for the local Better Auth deployment after ${timeoutMs}ms.`,
      `- last readiness error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
      ...(getOutput ? ['', 'Captured Convex output:', getOutput()] : []),
    ].join('\n'),
  )
}

function retainLocalConvex(handle: LocalConvexHandle): () => Promise<void> {
  retainers += 1
  let released = false

  return async () => {
    if (released) return
    released = true

    if (activeHandle?.process !== handle.process) return
    retainers -= 1
    if (retainers > 0) return

    activeHandle = null
    await terminateChild(handle.process)
  }
}

async function startLocalConvex(
  cwd: string,
  timeoutMs: number,
  authOrigin: string,
  deploymentEnv: Readonly<Record<string, string>>,
): Promise<LocalConvexHandle> {
  const reviewedBackend = await assertCurrentBackendBinary()
  const child = spawnConvex(cwd, ['dev', '--local-backend-version', reviewedBackend.version])
  const getOutput = createChildOutputReader(child)

  try {
    const selected = await waitForLocalConvexStart(child, cwd, timeoutMs, getOutput)
    await configureLocalAuthEnvironment(cwd, authOrigin, deploymentEnv)
    await waitForLocalAuthDeployment(
      cwd,
      selected.url,
      selected.siteUrl,
      timeoutMs,
      authOrigin,
      getOutput,
    )

    const handle: LocalConvexHandle = {
      authOrigin,
      cwd,
      deploymentEnv,
      process: child,
      url: selected.url,
      siteUrl: selected.siteUrl,
    }
    activeHandle = handle
    child.once('exit', () => {
      if (activeHandle?.process === child) {
        activeHandle = null
        retainers = 0
      }
    })
    return handle
  } catch (error) {
    await terminateChild(child)
    throw error
  }
}

function assertRequiredLocalUrls(cwd: string, url: string, siteUrl: string): void {
  if (process.env.BCN_E2E_REQUIRE_LOCAL !== 'true') return
  if (isLoopbackUrl(url) && isLoopbackUrl(siteUrl)) return

  throw new Error(
    [
      '[e2e] BCN_E2E_REQUIRE_LOCAL=true, but the configured Convex URLs are not loopback URLs.',
      `- CONVEX_URL: ${url}`,
      `- CONVEX_SITE_URL: ${siteUrl}`,
      buildLocalConvexSetupHelp(cwd),
    ].join('\n'),
  )
}

export async function ensureLocalConvex(
  options: EnsureLocalConvexOptions = {},
): Promise<EnsureLocalConvexResult> {
  const cwd = options.cwd ?? path.resolve(process.cwd(), 'playground')
  const timeoutMs = options.timeoutMs ?? 25_000
  const autoStart = process.env.CONVEX_E2E_AUTO_START === 'true'
  const authOrigin = normalizeLocalAuthOrigin(options.authOrigin ?? 'http://localhost:3050')
  const deploymentEnv = normalizeLocalDeploymentEnv(options.deploymentEnv)

  if (activeHandle) {
    if (activeHandle.cwd !== cwd || activeHandle.authOrigin !== authOrigin) {
      throw new Error(
        `A local Convex backend is already managed for ${activeHandle.cwd} at ${activeHandle.authOrigin}; cannot also manage ${cwd} at ${authOrigin}.`,
      )
    }
    if (!localDeploymentEnvMatches(activeHandle.deploymentEnv, deploymentEnv)) {
      throw new Error(
        `A local Convex backend is already managed for ${cwd} with a different deployment environment.`,
      )
    }

    return {
      env: installResolvedLocalEnv(activeHandle.url, activeHandle.siteUrl),
      release: retainLocalConvex(activeHandle),
    }
  }

  const envFile = await readLocalConvexEnv(cwd)
  const explicitUrl = process.env.CONVEX_URL ?? envFile.url
  const explicitSiteUrl = explicitUrl
    ? (process.env.CONVEX_SITE_URL ??
      envFile.siteUrl ??
      deriveSiteUrlFromConvexUrl(explicitUrl) ??
      undefined)
    : undefined
  const key = startupKey(cwd, `${explicitUrl ?? 'auto'}:${authOrigin}`, deploymentEnv)
  const previousFailure = startupFailures.get(key)
  if (previousFailure) throw previousFailure

  if (explicitUrl && explicitSiteUrl) {
    assertRequiredLocalUrls(cwd, explicitUrl, explicitSiteUrl)
    const port = localPortFromUrl(explicitUrl)

    if (port === null) {
      return {
        env: installResolvedLocalEnv(explicitUrl, explicitSiteUrl),
        release: async () => {},
      }
    }

    try {
      await assertCurrentBackendBinary()
      await waitForPort(port, 1500)
      if (autoStart) {
        await configureLocalAuthEnvironment(cwd, authOrigin, deploymentEnv)
        await waitForLocalAuthDeployment(cwd, explicitUrl, explicitSiteUrl, timeoutMs, authOrigin)
      }
      return {
        env: installResolvedLocalEnv(explicitUrl, explicitSiteUrl),
        release: async () => {},
      }
    } catch (error) {
      if (!autoStart) {
        throw cacheStartupFailure(
          key,
          new Error(
            [
              `Configured local Convex backend is not reachable at ${explicitUrl}.`,
              `- cause: ${error instanceof Error ? error.message : String(error)}`,
              buildLocalConvexSetupHelp(cwd),
            ].join('\n'),
          ),
        )
      }
    }
  } else if (!autoStart) {
    throw cacheStartupFailure(key, new Error(buildLocalConvexSetupHelp(cwd)))
  }

  try {
    const handle = await startLocalConvex(cwd, timeoutMs, authOrigin, deploymentEnv)
    assertRequiredLocalUrls(cwd, handle.url, handle.siteUrl)
    return {
      env: installResolvedLocalEnv(handle.url, handle.siteUrl),
      release: retainLocalConvex(handle),
    }
  } catch (error) {
    throw cacheStartupFailure(
      key,
      [
        error instanceof Error ? error.message : String(error),
        '',
        buildLocalConvexSetupHelp(cwd),
      ].join('\n'),
    )
  }
}
