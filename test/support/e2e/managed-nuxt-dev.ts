import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { once } from 'node:events'

import { getFreePort, waitForPort } from './ports'

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
  const child: ChildProcessWithoutNullStreams = spawn(
    'pnpm',
    [
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
    {
      cwd: options.workspaceRoot,
      env: {
        ...process.env,
        ...options.env,
      },
      stdio: 'pipe',
    },
  )

  child.stdout.on('data', () => {})
  child.stderr.on('data', () => {})

  await waitForPort(port, startupTimeoutMs)

  return {
    origin: `http://127.0.0.1:${port}`,
    port,
    release: async () => {
      child.kill('SIGTERM')
      await once(child, 'exit').catch(() => {})
    },
  }
}
