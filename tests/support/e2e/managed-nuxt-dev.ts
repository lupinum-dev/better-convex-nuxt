import { waitForHttpReady } from './http'
import { spawnManagedProcess } from './managed-process'
import { getFreePort } from './ports'

export interface ManagedNuxtDevHandle {
  origin: string
  port: number
  release: () => Promise<void>
}

export interface StartManagedNuxtDevOptions {
  projectDir: string
  workspaceRoot: string
  env?: Record<string, string>
  startupTimeoutMs?: number
}

export async function startManagedNuxtDev(
  options: StartManagedNuxtDevOptions,
): Promise<ManagedNuxtDevHandle> {
  const port = await getFreePort()
  const startupTimeoutMs = options.startupTimeoutMs ?? 45_000
  const managedProcess = spawnManagedProcess({
    name: 'Nuxt dev server',
    command: 'pnpm',
    args: [
      'exec',
      'nuxi',
      'dev',
      '--cwd',
      options.projectDir,
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
    ],
    cwd: options.workspaceRoot,
    env: {
      ...process.env,
      ...options.env,
    },
  })
  const origin = `http://127.0.0.1:${port}`

  try {
    await Promise.race([
      waitForHttpReady(`${origin}/api/test-ready`, startupTimeoutMs),
      managedProcess.unexpectedExit,
    ])
  } catch (error) {
    await managedProcess.stop()
    throw managedProcess.createFailure('Nuxt dev server failed to become ready.', error)
  }

  return {
    origin,
    port,
    release: async () => {
      await managedProcess.stop()
    },
  }
}
