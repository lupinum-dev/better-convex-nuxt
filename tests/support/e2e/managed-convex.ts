import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { INTERNAL_HARNESS_LOCAL_TRUSTED_FORWARDING_KEY } from '../../../apps/harness/shared/dev-trusted-forwarding-key'
import {
  assertLocalAuthReady,
  deriveSiteUrlFromConvexUrl,
  readLocalConvexEnv,
} from './auth-preflight'
import { spawnManagedProcess } from './managed-process'
import { terminateListeningPorts, waitForPort } from './ports'

interface ManagedLocalConvexHandle {
  port: number
  release: () => Promise<void>
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
const convexCliPath = fileURLToPath(
  new URL('../../../node_modules/convex/bin/main.js', import.meta.url),
)

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
  const cwd = options.cwd ?? path.resolve(process.cwd(), 'apps/harness')
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
  const trustedForwardingKey =
    process.env.CONVEX_TRUSTED_FORWARDING_KEY ??
    envFile.trustedForwardingKey ??
    INTERNAL_HARNESS_LOCAL_TRUSTED_FORWARDING_KEY

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

    const managedProcess = spawnManagedProcess({
      name: 'Managed local Convex',
      command: process.execPath,
      args: [convexCliPath, 'dev', '--local', '--local-force-upgrade'],
      cwd,
      env: {
        ...process.env,
        ALLOW_TEST_RESET: 'true',
        SITE_URL: process.env.SITE_URL ?? 'http://localhost:3000',
        BETTER_AUTH_SECRET:
          process.env.BETTER_AUTH_SECRET ?? 'local-test-better-auth-secret-not-for-production',
        CONVEX_TRUSTED_FORWARDING_KEY: trustedForwardingKey,
        CONVEX_LOCAL_BACKEND_PORT: String(resolved.port),
      },
    })

    activeHandle = {
      port: resolved.port,
      release: async () => {
        await managedProcess.stop()
      },
      url: resolved.url,
    }

    try {
      await Promise.race([waitForPort(resolved.port, timeoutMs), managedProcess.unexpectedExit])
      await Promise.race([
        assertLocalAuthReady({
          cwd,
          env: {
            CONVEX_URL: resolved.url,
            CONVEX_SITE_URL: siteUrl,
          },
          timeoutMs: 10_000,
        }),
        managedProcess.unexpectedExit,
      ])
    } catch (error) {
      activeHandle = null
      await managedProcess.stop()
      throw managedProcess.createFailure('Managed local Convex failed to become ready.', error)
    }
  }

  retainers += 1

  const release = async () => {
    if (!activeHandle) return
    retainers -= 1
    if (retainers > 0) return

    const releaseManagedHandle = activeHandle.release
    activeHandle = null
    await releaseManagedHandle()
  }

  return {
    env: {
      ALLOW_TEST_RESET: 'true',
      CONVEX_TRUSTED_FORWARDING_KEY: trustedForwardingKey,
      CONVEX_URL: resolved.url,
      CONVEX_SITE_URL: siteUrl,
      NUXT_PUBLIC_CONVEX_URL: resolved.url,
      NUXT_PUBLIC_CONVEX_SITE_URL: siteUrl,
    },
    release,
  }
}
