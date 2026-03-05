import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'

interface LocalConvexHandle {
  process: ChildProcessWithoutNullStreams
  url: string
  port: number
}

interface LocalConvexEnv {
  url?: string
  siteUrl?: string
}

export interface EnsureLocalConvexResult {
  env: Record<string, string>
  release: () => Promise<void>
}

export interface LocalAuthPreflightOptions {
  cwd?: string
  env?: Record<string, string>
  origin?: string
  timeoutMs?: number
}

let activeHandle: LocalConvexHandle | null = null
let retainers = 0

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

function buildManualAuthSetupHelp(cwd: string): string {
  return [
    '[e2e][auth-loop] Local Better Auth setup is incomplete.',
    'Run these commands and retry:',
    `  cd ${cwd}`,
    '  npx convex dev --local --once',
    '  npx convex env set SITE_URL http://localhost:3000 --env-file .env.local',
    '  npx convex env set BETTER_AUTH_SECRET <strong-random-secret> --env-file .env.local',
    '  cd /Users/matthias/Git/libs/better-convex-nuxt && pnpm test:e2e',
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

  const origin = options.origin ?? 'http://localhost:3000'
  const getSessionEndpoint = `${siteUrl.replace(/\/$/, '')}/api/auth/get-session`

  let response: Response
  try {
    response = await fetchWithTimeout(
      getSessionEndpoint,
      {
        method: 'GET',
        headers: {
          origin,
          'x-forwarded-host': 'localhost:3000',
          'x-forwarded-proto': 'http',
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
        '- likely cause: SITE_URL/trusted origins do not include http://localhost:3000.',
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
        '- likely cause: missing/invalid BETTER_AUTH_SECRET or local auth component setup.',
        buildManualAuthSetupHelp(cwd),
      ].join('\n'),
    )
  }
}

export async function ensureLocalConvex(
  options: { port?: number; cwd?: string; timeoutMs?: number } = {},
): Promise<EnsureLocalConvexResult> {
  const cwd = options.cwd ?? path.resolve(process.cwd(), 'playground')
  const timeoutMs = options.timeoutMs ?? 25_000
  const envFile = await readLocalConvexEnv(cwd)
  const explicitUrl = process.env.CONVEX_URL ?? envFile.url

  if (explicitUrl) {
    const explicitSiteUrl =
      process.env.CONVEX_SITE_URL ?? envFile.siteUrl ?? deriveSiteUrlFromConvexUrl(explicitUrl)

    let explicitPort: number | null = null
    try {
      const parsed = new URL(explicitUrl)
      if (parsed.port) {
        const numeric = Number.parseInt(parsed.port, 10)
        if (!Number.isNaN(numeric)) {
          explicitPort = numeric
        }
      }
    } catch {
      explicitPort = null
    }

    if (!activeHandle && explicitPort) {
      try {
        await waitForPort(explicitPort, 1500)
      } catch {
        const child = spawn('npx', ['convex', 'dev', '--local'], {
          cwd,
          env: {
            ...process.env,
          },
          stdio: 'pipe',
        })

        child.stdout.on('data', () => {})
        child.stderr.on('data', () => {})

        child.once('exit', (code) => {
          if (code !== null && code !== 0 && activeHandle?.process === child) {
            activeHandle = null
          }
        })

        activeHandle = {
          process: child,
          url: explicitUrl,
          port: explicitPort,
        }

        await waitForPort(explicitPort, timeoutMs)
      }
    }

    if (activeHandle && activeHandle.url === explicitUrl) {
      retainers += 1
    }

    const release = async () => {
      if (!activeHandle) return
      retainers -= 1
      if (retainers > 0) return

      const child = activeHandle.process
      activeHandle = null
      child.kill('SIGTERM')

      const timer = setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL')
        }
      }, 3000)

      await once(child, 'exit').catch(() => {})
      clearTimeout(timer)
    }

    return {
      env: {
        CONVEX_URL: explicitUrl,
        NUXT_PUBLIC_CONVEX_URL: explicitUrl,
        ...(explicitSiteUrl ? { CONVEX_SITE_URL: explicitSiteUrl } : {}),
        ...(explicitSiteUrl ? { NUXT_PUBLIC_CONVEX_SITE_URL: explicitSiteUrl } : {}),
        ALLOW_TEST_RESET: process.env.ALLOW_TEST_RESET ?? 'true',
      },
      release,
    }
  }

  const port = options.port ?? 3214
  const url = `http://127.0.0.1:${port}`

  if (!activeHandle) {
    const child = spawn('npx', ['convex', 'dev', '--local'], {
      cwd,
      env: {
        ...process.env,
        CONVEX_LOCAL_BACKEND_PORT: String(port),
      },
      stdio: 'pipe',
    })

    child.stdout.on('data', () => {})
    child.stderr.on('data', () => {})

    child.once('exit', (code) => {
      if (code !== null && code !== 0 && activeHandle?.process === child) {
        activeHandle = null
      }
    })

    activeHandle = {
      process: child,
      url,
      port,
    }

    await waitForPort(port, timeoutMs)
  }

  retainers += 1

  const release = async () => {
    retainers -= 1
    if (retainers > 0) return
    if (!activeHandle) return

    const child = activeHandle.process
    activeHandle = null
    child.kill('SIGTERM')

    const timer = setTimeout(() => {
      if (!child.killed) {
        child.kill('SIGKILL')
      }
    }, 3000)

    await once(child, 'exit').catch(() => {})
    clearTimeout(timer)
  }

  return {
    env: {
      CONVEX_URL: activeHandle.url,
      NUXT_PUBLIC_CONVEX_URL: activeHandle.url,
      CONVEX_SITE_URL: `http://127.0.0.1:${activeHandle.port + 1}`,
      NUXT_PUBLIC_CONVEX_SITE_URL: `http://127.0.0.1:${activeHandle.port + 1}`,
      ALLOW_TEST_RESET: 'true',
    },
    release,
  }
}
