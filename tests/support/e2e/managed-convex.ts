import { execFile } from 'node:child_process'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { INTERNAL_HARNESS_LOCAL_IDENTITY_FORWARDING_KEY } from '../../../apps/harness/shared/dev-identity-forwarding-key'
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
const execFileAsync = promisify(execFile)
const MANAGED_CONVEX_DEPLOYMENT = 'anonymous:anonymous-harness'
const MANAGED_CONVEX_ENV_SET_RETRIES = 10
const MANAGED_CONVEX_ENV_SET_RETRY_DELAY_MS = 500
const MANAGED_CONVEX_ENV_DISCOVERY_TIMEOUT_MS = 15_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryableConvexEnvSetError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const details = [
    error.message,
    'stdout' in error && typeof error.stdout === 'string' ? error.stdout : '',
    'stderr' in error && typeof error.stderr === 'string' ? error.stderr : '',
  ].join('\n')

  return /OptimisticConcurrencyControlFailure|Environment variables have changed|Unable to start push|Failed to load deployment config|fetch failed|ECONNREFUSED|connection refused|timed out/i.test(
    details,
  )
}

async function setManagedLocalConvexEnvVar(
  cwd: string,
  name: string,
  value: string,
  processEnv: NodeJS.ProcessEnv,
): Promise<void> {
  for (let attempt = 1; attempt <= MANAGED_CONVEX_ENV_SET_RETRIES; attempt += 1) {
    try {
      await execFileAsync(
        process.execPath,
        [convexCliPath, 'env', 'set', name, value, '--env-file', '.env.local'],
        {
          cwd,
          env: processEnv,
        },
      )
      return
    } catch (error) {
      if (!isRetryableConvexEnvSetError(error) || attempt === MANAGED_CONVEX_ENV_SET_RETRIES) {
        throw error
      }
      await sleep(MANAGED_CONVEX_ENV_SET_RETRY_DELAY_MS * attempt)
    }
  }
}

async function waitForManagedConvexEnv(
  cwd: string,
  expectedPort: number,
  timeoutMs: number,
): Promise<{ url: string; siteUrl: string }> {
  const started = Date.now()

  while (Date.now() - started <= timeoutMs) {
    const envFile = await readLocalConvexEnv(cwd)

    if (envFile.url && envFile.siteUrl) {
      try {
        const url = new URL(envFile.url)
        if (Number.parseInt(url.port || '0', 10) === expectedPort) {
          return {
            url: envFile.url,
            siteUrl: envFile.siteUrl,
          }
        }
      } catch {
        // Keep polling until Convex has written a usable env file.
      }
    }

    await sleep(250)
  }

  throw new Error(
    `[e2e][managed-convex] Timed out waiting for .env.local to expose CONVEX_URL/CONVEX_SITE_URL for port ${expectedPort}.`,
  )
}

async function setManagedLocalConvexEnv(
  cwd: string,
  envVars: Record<string, string>,
  processEnv: NodeJS.ProcessEnv,
): Promise<void> {
  for (const [name, value] of Object.entries(envVars)) {
    await setManagedLocalConvexEnvVar(cwd, name, value, processEnv)
  }
}

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

function parseLocalPort(urlString: string): number | null {
  try {
    const url = new URL(urlString)
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
      return null
    }
    const port = Number.parseInt(url.port, 10)
    return Number.isNaN(port) ? null : port
  } catch {
    return null
  }
}

async function listFilesRecursive(root: string, current = root): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const fullPath = path.join(current, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(root, fullPath)))
      continue
    }

    if (entry.isFile()) {
      files.push(path.relative(root, fullPath))
    }
  }

  return files.sort()
}

export async function snapshotGeneratedDir(cwd: string): Promise<() => Promise<void>> {
  const generatedDir = path.join(cwd, 'convex/_generated')
  const snapshot = new Map<string, Buffer>()

  for (const relativePath of await listFilesRecursive(generatedDir)) {
    snapshot.set(relativePath, await readFile(path.join(generatedDir, relativePath)))
  }

  return async () => {
    await mkdir(generatedDir, { recursive: true })
    const currentFiles = new Set(await listFilesRecursive(generatedDir))

    for (const relativePath of currentFiles) {
      if (!snapshot.has(relativePath)) {
        await rm(path.join(generatedDir, relativePath), { force: true })
      }
    }

    for (const [relativePath, contents] of snapshot) {
      const target = path.join(generatedDir, relativePath)
      const current = currentFiles.has(relativePath) ? await readFile(target) : null
      if (current && Buffer.compare(current, contents) === 0) continue

      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, contents)
    }
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
  const initialSiteUrl =
    process.env.CONVEX_SITE_URL ??
    envFile.siteUrl ??
    deriveSiteUrlFromConvexUrl(resolved.url) ??
    `http://127.0.0.1:${resolved.port + 1}`
  const identityForwardingKey =
    process.env.CONVEX_IDENTITY_FORWARDING_KEY ?? INTERNAL_HARNESS_LOCAL_IDENTITY_FORWARDING_KEY

  if (!activeHandle) {
    const restoreGenerated = await snapshotGeneratedDir(cwd)
    const envFilePath = path.join(cwd, '.env.local')
    const originalEnvFile = await readFile(envFilePath).catch((error: unknown) => {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        return null
      }
      throw error
    })
    const restoreEnvFile = async () => {
      if (originalEnvFile === null) {
        await rm(envFilePath, { force: true })
        return
      }
      await writeFile(envFilePath, originalEnvFile)
    }

    await rm(path.join(cwd, '.convex', 'local', 'default'), { recursive: true, force: true })
    const managedPorts = new Set<number>([resolved.port, resolved.port + 1])
    for (const candidate of [resolved.url, initialSiteUrl]) {
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
        CONVEX_DEPLOYMENT: MANAGED_CONVEX_DEPLOYMENT,
        CONVEX_IDENTITY_FORWARDING_KEY: identityForwardingKey,
        CONVEX_LOCAL_BACKEND_PORT: String(resolved.port),
      },
    })

    activeHandle = {
      port: resolved.port,
      release: async () => {
        try {
          await managedProcess.stop()
        } finally {
          await restoreEnvFile()
          await restoreGenerated()
        }
      },
      url: resolved.url,
    }

    try {
      await Promise.race([waitForPort(resolved.port, timeoutMs), managedProcess.unexpectedExit])
      const managedEnv = await Promise.race([
        waitForManagedConvexEnv(cwd, resolved.port, MANAGED_CONVEX_ENV_DISCOVERY_TIMEOUT_MS),
        managedProcess.unexpectedExit,
      ])
      activeHandle.url = managedEnv.url
      const managedSitePort = parseLocalPort(managedEnv.siteUrl)

      if (managedSitePort !== null) {
        await Promise.race([waitForPort(managedSitePort, timeoutMs), managedProcess.unexpectedExit])
      }

      await Promise.race([
        setManagedLocalConvexEnv(
          cwd,
          {
            SITE_URL: process.env.SITE_URL ?? 'http://localhost:3000',
            BETTER_AUTH_SECRET:
              process.env.BETTER_AUTH_SECRET ?? 'local-test-better-auth-secret-not-for-production',
            CONVEX_IDENTITY_FORWARDING_KEY: identityForwardingKey,
          },
          {
            ...process.env,
            CONVEX_DEPLOYMENT: MANAGED_CONVEX_DEPLOYMENT,
            CONVEX_URL: managedEnv.url,
            CONVEX_SITE_URL: managedEnv.siteUrl,
            CONVEX_IDENTITY_FORWARDING_KEY: identityForwardingKey,
          },
        ),
        managedProcess.unexpectedExit,
      ])
      await Promise.race([
        assertLocalAuthReady({
          cwd,
          env: {
            CONVEX_DEPLOYMENT: MANAGED_CONVEX_DEPLOYMENT,
            CONVEX_URL: managedEnv.url,
            CONVEX_SITE_URL: managedEnv.siteUrl,
          },
          timeoutMs: 20_000,
        }),
        managedProcess.unexpectedExit,
      ])
    } catch (error) {
      activeHandle = null
      try {
        await managedProcess.stop()
      } finally {
        await restoreEnvFile()
        await restoreGenerated()
      }
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

  const finalEnv = await readLocalConvexEnv(cwd)
  const finalSiteUrl = finalEnv.siteUrl ?? process.env.CONVEX_SITE_URL ?? initialSiteUrl

  return {
    env: {
      ALLOW_TEST_RESET: 'true',
      CONVEX_DEPLOYMENT: MANAGED_CONVEX_DEPLOYMENT,
      CONVEX_IDENTITY_FORWARDING_KEY: identityForwardingKey,
      CONVEX_URL: activeHandle.url,
      CONVEX_SITE_URL: finalSiteUrl,
      NUXT_PUBLIC_CONVEX_URL: activeHandle.url,
      NUXT_PUBLIC_CONVEX_SITE_URL: finalSiteUrl,
    },
    release,
  }
}
