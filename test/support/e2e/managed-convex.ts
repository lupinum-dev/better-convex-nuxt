import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { once } from 'node:events'
import path from 'node:path'

import { INTERNAL_HARNESS_LOCAL_TRUSTED_CALLER_KEY } from '../../internal-harness/shared/dev-trusted-caller-key'
import {
  assertLocalAuthReady,
  deriveSiteUrlFromConvexUrl,
  readLocalConvexEnv,
} from './auth-preflight'
import { terminateListeningPorts, waitForPort } from './ports'

interface ManagedLocalConvexHandle {
  process: ChildProcessWithoutNullStreams
  port: number
  url: string
}

export interface ManagedLocalConvexResult {
  env: Record<string, string>
  release: () => Promise<void>
}

export interface EnsureManagedLocalConvexOptions {
  cwd?: string
  timeoutMs?: number
}

let activeHandle: ManagedLocalConvexHandle | null = null
let retainers = 0

function parseManagedConvexUrl(urlString: string): { port: number; url: string } {
  let url: URL
  try {
    url = new URL(urlString)
  } catch {
    throw new TypeError(`[e2e][managed-convex] Invalid CONVEX_URL: ${urlString}`)
  }

  if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
    throw new TypeError(
      `[e2e][managed-convex] Managed E2E requires a local CONVEX_URL, received: ${urlString}`,
    )
  }

  const port = Number.parseInt(url.port || '3210', 10)
  if (Number.isNaN(port)) {
    throw new TypeError(
      `[e2e][managed-convex] Managed local Convex requires a numeric port: ${urlString}`,
    )
  }

  url.hostname = '127.0.0.1'
  url.port = String(port)
  return {
    port,
    url: url.toString().replace(/\/$/, ''),
  }
}

export async function ensureManagedLocalConvex(
  options: EnsureManagedLocalConvexOptions = {},
): Promise<ManagedLocalConvexResult> {
  const cwd = options.cwd ?? path.resolve(process.cwd(), 'test/internal-harness')
  const timeoutMs = options.timeoutMs ?? 60_000
  const envFile = await readLocalConvexEnv(cwd)
  const resolved = parseManagedConvexUrl(
    process.env.CONVEX_URL ?? envFile.url ?? 'http://127.0.0.1:3210',
  )
  const siteUrl =
    process.env.CONVEX_SITE_URL ??
    envFile.siteUrl ??
    deriveSiteUrlFromConvexUrl(resolved.url) ??
    `http://127.0.0.1:${resolved.port + 1}`
  const trustedCallerKey =
    process.env.CONVEX_TRUSTED_CALLER_KEY ??
    envFile.trustedCallerKey ??
    INTERNAL_HARNESS_LOCAL_TRUSTED_CALLER_KEY

  if (!activeHandle) {
    const managedPorts = new Set<number>([resolved.port, resolved.port + 1])
    for (const candidate of [resolved.url, siteUrl]) {
      try {
        const parsed = new URL(candidate)
        if (parsed.port) {
          const parsedPort = Number.parseInt(parsed.port, 10)
          if (!Number.isNaN(parsedPort)) {
            managedPorts.add(parsedPort)
          }
        }
      } catch (error) {
        void error
      }
    }

    await terminateListeningPorts([...managedPorts])

    const child = spawn('npx', ['convex', 'dev', '--local'], {
      cwd,
      env: {
        ...process.env,
        ALLOW_TEST_RESET: 'true',
        SITE_URL: process.env.SITE_URL ?? 'http://localhost:3000',
        BETTER_AUTH_SECRET:
          process.env.BETTER_AUTH_SECRET ?? 'local-test-better-auth-secret-not-for-production',
        CONVEX_TRUSTED_CALLER_KEY: trustedCallerKey,
        CONVEX_LOCAL_BACKEND_PORT: String(resolved.port),
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
      port: resolved.port,
      url: resolved.url,
    }

    await waitForPort(resolved.port, timeoutMs)
    await assertLocalAuthReady({
      cwd,
      env: {
        CONVEX_URL: resolved.url,
        CONVEX_SITE_URL: siteUrl,
      },
      timeoutMs: 10_000,
    })
  }

  retainers += 1

  const release = async () => {
    if (!activeHandle) return
    retainers -= 1
    if (retainers > 0) return

    const managedChild = activeHandle.process
    activeHandle = null
    managedChild.kill('SIGTERM')

    const timer = setTimeout(() => {
      if (!managedChild.killed) {
        managedChild.kill('SIGKILL')
      }
    }, 3_000)

    await once(managedChild, 'exit').catch(() => {})
    clearTimeout(timer)
  }

  return {
    env: {
      ALLOW_TEST_RESET: 'true',
      CONVEX_TRUSTED_CALLER_KEY: trustedCallerKey,
      CONVEX_URL: resolved.url,
      CONVEX_SITE_URL: siteUrl,
      NUXT_PUBLIC_CONVEX_URL: resolved.url,
      NUXT_PUBLIC_CONVEX_SITE_URL: siteUrl,
    },
    release,
  }
}
