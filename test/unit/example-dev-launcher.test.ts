import { EventEmitter } from 'node:events'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildExampleRuntimeEnv,
  clearPorts,
  convexGeneratedDir,
  convexLocalConfigPath,
  createSignalHandler,
  findAvailablePortPair,
  getDesiredSiteUrl,
  getDesiredNuxtPort,
  parseEnvFile,
  prefixStream,
  readConvexLocalConfig,
  resolveConvexEnvVars,
  runExampleDev,
  selectExamplePortPair,
  serializeEnvFile,
  shouldResetLocalBackendForMissingSecret,
  stripManagedConvexEnvVars,
  syncConvexLocalConfigPortPair,
  stopChild,
  waitForConvexEnv,
  waitForConvexReady,
} from '../../scripts/example-dev.mjs'

class FakeStream extends EventEmitter {}

type FakeChildProcess = EventEmitter & {
  stdout: FakeStream
  stderr: FakeStream
  exitCode: number | null
  killed: boolean
  kill: (signal?: NodeJS.Signals) => boolean
}

function createChildProcess(): FakeChildProcess {
  const child = new EventEmitter() as FakeChildProcess
  child.stdout = new FakeStream()
  child.stderr = new FakeStream()
  child.exitCode = null
  child.killed = false
  child.kill = vi.fn((signal?: NodeJS.Signals) => {
    child.killed = true
    child.exitCode = signal === 'SIGKILL' ? 137 : 0
    queueMicrotask(() => child.emit('exit', child.exitCode, signal))
    return true
  })
  return child
}

describe('example dev launcher', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('chooses the first free backend/site port pair', async () => {
    const freePorts = new Set([3214, 3215])
    const port = await findAvailablePortPair({
      start: 3210,
      end: 3216,
      isPortFreeFn: async candidate => freePorts.has(candidate),
    })

    expect(port).toBe(3214)
  })

  it('clears listening processes on the requested ports', async () => {
    const killed: Array<{ pid: number, signal: NodeJS.Signals }> = []
    const portState = new Map<number, number[]>([
      [3000, [111]],
      [3210, [222, 333]],
      [3211, []],
    ])

    await clearPorts([3000, 3210, 3211, 3210], {
      findListeningPidsFn: port => portState.get(port) ?? [],
      killFn: ((pid: number, signal: NodeJS.Signals) => {
        killed.push({ pid, signal })
        for (const [port, pids] of portState.entries()) {
          if (pids.includes(pid)) {
            portState.set(port, [])
          }
        }
      }) as typeof process.kill,
      sleepFn: async () => {},
      stdout: { write: () => true } as unknown as typeof process.stdout,
    })

    expect(killed).toEqual([
      { pid: 111, signal: 'SIGTERM' },
      { pid: 222, signal: 'SIGTERM' },
      { pid: 333, signal: 'SIGTERM' },
    ])
  })

  it('derives Convex runtime env from the chosen port', () => {
    const env = buildExampleRuntimeEnv({
      port: 3218,
      baseEnv: { SITE_URL: 'http://localhost:3000' } as NodeJS.ProcessEnv,
    })

    expect(env.CONVEX_LOCAL_BACKEND_PORT).toBe('3218')
    expect(env.CONVEX_URL).toBe('http://127.0.0.1:3218')
    expect(env.NUXT_PUBLIC_CONVEX_URL).toBe('http://127.0.0.1:3218')
    expect(env.CONVEX_SITE_URL).toBe('http://127.0.0.1:3219')
    expect(env.NUXT_PUBLIC_CONVEX_SITE_URL).toBe('http://127.0.0.1:3219')
    expect((env as Record<string, string | undefined>).SITE_URL).toBe('http://localhost:3000')
  })

  it('maps example numbers to deterministic Nuxt ports', () => {
    expect(getDesiredNuxtPort('/repo/examples/01-public-todo')).toBe(4121)
    expect(getDesiredNuxtPort('/repo/examples/02-auth-todo')).toBe(4122)
    expect(getDesiredNuxtPort('/repo/examples/09-doc-sharing')).toBe(4129)
    expect(getDesiredNuxtPort('/repo/examples/10-agency-portal')).toBe(4130)
    expect(getDesiredSiteUrl('/repo/examples/09-doc-sharing')).toBe('http://localhost:4129')
  })

  it('auto-generates secrets for placeholder values in .env.example', () => {
    const resolved = resolveConvexEnvVars({
      BETTER_AUTH_SECRET: 'replace-me',
      CONVEX_SERVICE_KEY: 'replace-me-with-a-long-random-shared-secret',
      SITE_URL: 'http://127.0.0.1:3000',
    }) as Record<string, string>

    expect(resolved.SITE_URL).toBe('http://127.0.0.1:3000')
    expect(resolved.BETTER_AUTH_SECRET).not.toMatch(/replace.?me/i)
    expect(resolved.BETTER_AUTH_SECRET).toHaveLength(64) // 32 bytes hex
    expect(resolved.CONVEX_SERVICE_KEY).not.toMatch(/replace.?me/i)
    expect(resolved.CONVEX_SERVICE_KEY).not.toBe(resolved.BETTER_AUTH_SECRET)
  })

  it('reuses persisted secrets from .env.local when placeholders are resolved', () => {
    const resolved = resolveConvexEnvVars(
      {
        BETTER_AUTH_SECRET: 'replace-me',
        SITE_URL: 'http://localhost:4129',
      },
      {
        BETTER_AUTH_SECRET: 'stable-secret',
        SITE_URL: 'http://127.0.0.1:3000',
      },
    ) as Record<string, string>

    expect(resolved.BETTER_AUTH_SECRET).toBe('stable-secret')
    expect(resolved.SITE_URL).toBe('http://localhost:4129')
  })

  it('strips launcher-managed Convex runtime keys from .env.local values', () => {
    expect(stripManagedConvexEnvVars({
      BETTER_AUTH_SECRET: 'stable-secret',
      SITE_URL: 'http://localhost:3000',
      CONVEX_URL: 'http://127.0.0.1:3210',
      CONVEX_SITE_URL: 'http://127.0.0.1:3211',
      CONVEX_DEPLOYMENT: 'anonymous:demo',
    })).toEqual({
      BETTER_AUTH_SECRET: 'stable-secret',
      SITE_URL: 'http://localhost:3000',
    })
  })

  it('serializes env files without dropping values', () => {
    expect(serializeEnvFile({
      BETTER_AUTH_SECRET: 'stable-secret',
      SITE_URL: 'http://localhost:3000',
    })).toBe('BETTER_AUTH_SECRET=stable-secret\nSITE_URL=http://localhost:3000')
  })

  it('resets the local backend only when a generated auth secret has not been persisted yet', () => {
    expect(shouldResetLocalBackendForMissingSecret(
      { BETTER_AUTH_SECRET: 'replace-me', SITE_URL: 'http://localhost:3000' },
      {},
    )).toBe(true)

    expect(shouldResetLocalBackendForMissingSecret(
      { BETTER_AUTH_SECRET: 'replace-me', SITE_URL: 'http://localhost:3000' },
      { BETTER_AUTH_SECRET: 'stable-secret' },
    )).toBe(false)
  })

  it('reads Convex deployment env from .env.local', () => {
    const cwd = '/repo/examples/01-public-todo'
    const env = parseEnvFile(cwd, '.env.local')
    expect(env).toEqual({})
  })

  it('reads project-local Convex config when present', () => {
    const cwd = '/repo/examples/01-public-todo'
    const config = readConvexLocalConfig(cwd, {
      existsSyncFn: () => true,
      readFileSyncFn: ((() => '{"ports":{"cloud":3210,"site":3211},"deploymentName":"anonymous-agent"}') as unknown) as typeof import('node:fs').readFileSync,
    })

    expect(config).toEqual({
      ports: { cloud: 3210, site: 3211 },
      deploymentName: 'anonymous-agent',
    })
  })

  it('reuses the saved Convex port pair when it is still free', async () => {
    const port = await selectExamplePortPair({
      cwd: '/repo/examples/01-public-todo',
      readConvexLocalConfigFn: () => ({
        ports: { cloud: 3216, site: 3217 },
      }),
      isPortFreeFn: async candidate => candidate === 3216 || candidate === 3217,
      findAvailablePortPairFn: async () => 3220,
    } as Parameters<typeof selectExamplePortPair>[0])

    expect(port).toBe(3216)
  })

  it('rewrites the saved Convex port pair when the configured one is occupied', () => {
    const writeFileSyncFn = vi.fn()

    syncConvexLocalConfigPortPair('/repo/examples/01-public-todo', 3222, {
      readConvexLocalConfigFn: () => ({
        ports: { cloud: 3210, site: 3211 },
        deploymentName: 'anonymous-agent',
      }),
      writeConvexLocalConfigFn: (cwd, config) => {
        writeFileSyncFn(convexLocalConfigPath(cwd), `${JSON.stringify(config)}\n`, 'utf8')
      },
    })

    expect(writeFileSyncFn).toHaveBeenCalledWith(
      expect.stringContaining('.convex/local/default/config.json'),
      `${JSON.stringify({
        ports: { cloud: 3222, site: 3223 },
        deploymentName: 'anonymous-agent',
      })}\n`,
      'utf8',
    )
  })

  it('waits for both the backend port and generated directory', async () => {
    const portReady = vi.fn()
    const dirReady = vi.fn().mockResolvedValue(convexGeneratedDir('/repo/examples/01-public-todo'))

    await waitForConvexReady('/repo/examples/01-public-todo', 3210, {
      connectFn: async () => {
        portReady()
        return true
      },
      existsSyncFn: () => true,
      timeoutMs: 50,
      intervalMs: 1,
    })

    expect(portReady).toHaveBeenCalled()

    await waitForConvexReady('/repo/examples/01-public-todo', 3210, {
      connectFn: async () => true,
      existsSyncFn: (() => {
        let seen = false
        return () => {
          if (seen) return true
          seen = true
          dirReady()
          return false
        }
      })(),
      timeoutMs: 50,
      intervalMs: 1,
    })

    expect(dirReady).toHaveBeenCalled()
  })

  it('waits for Convex URLs to appear in .env.local', async () => {
    const env = await waitForConvexEnv('/repo/examples/01-public-todo', {
      parseEnvFileFn: (() => {
        let attempts = 0
        return (): Record<string, string> => {
          attempts += 1
          if (attempts < 2) return {}
          return {
            CONVEX_URL: 'http://127.0.0.1:3212',
            CONVEX_SITE_URL: 'http://127.0.0.1:3213',
          }
        }
      })(),
      timeoutMs: 50,
      intervalMs: 1,
    })

    expect((env as Record<string, string | undefined>).CONVEX_URL).toBe('http://127.0.0.1:3212')
    expect((env as Record<string, string | undefined>).CONVEX_SITE_URL).toBe('http://127.0.0.1:3213')
  })

  it('skips stale .env.local entries that do not match the expected port', async () => {
    const options: Parameters<typeof waitForConvexEnv>[1] & { expectedUrl: string } = {
      expectedUrl: ':3214',
      parseEnvFileFn: (() => {
        let attempts = 0
        return (): Record<string, string> => {
          attempts++
          if (attempts < 3) {
            return {
              CONVEX_URL: 'http://127.0.0.1:3210',
              CONVEX_SITE_URL: 'http://127.0.0.1:3211',
            }
          }
          return {
            CONVEX_URL: 'http://127.0.0.1:3214',
            CONVEX_SITE_URL: 'http://127.0.0.1:3215',
          }
        }
      })(),
      timeoutMs: 50,
      intervalMs: 1,
    }
    const env = await waitForConvexEnv('/repo', options)

    expect((env as Record<string, string | undefined>).CONVEX_URL).toBe('http://127.0.0.1:3214')
  })

  it('prefixes subprocess output with stable labels', () => {
    const stream = new FakeStream()
    const output: string[] = []
    const writeSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: string | Uint8Array) => {
        output.push(String(chunk))
        return true
      })
    const flush = prefixStream(stream, 'convex', '36', {
      write: writeSpy,
    } as unknown as typeof process.stdout)

    stream.emit('data', Buffer.from('first line\nsecond'))
    stream.emit('data', Buffer.from(' line\n'))
    stream.emit('end')
    flush()

    expect(output.join('')).toContain('convex')
    expect(output.join('')).toContain('first line')
    expect(output.join('')).toContain('second line')
  })

  it('maps SIGINT to a clean shutdown request', async () => {
    const shutdown = vi.fn().mockResolvedValue(undefined)
    const stderr = process.stderr
    const handler = createSignalHandler({
      signalName: 'SIGINT',
      stderr,
      shutdown,
    })

    handler()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(shutdown).toHaveBeenCalledWith(0)
  })

  it('sends SIGTERM to children during shutdown', async () => {
    const child = createChildProcess()

    await stopChild(child, 5)

    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
  })

  it('passes the pre-selected port to convex dev via local port flags', async () => {
    const convex = createChildProcess()
    const spawnFn = vi.fn().mockReturnValue(convex)
    const clearPortsFn = vi.fn().mockResolvedValue(undefined)

    const processExit: (code?: string | number | null) => never = vi.fn(
      ((_) => undefined as never) as (code?: string | number | null) => never,
    )
    const pending = runExampleDev({
      cwd: '/repo/examples/01-public-todo',
      spawnFn,
      findAvailablePortPairFn: async () => 3214,
      isPortFreeFn: async () => false,
      waitForConvexEnvFn: () => new Promise(() => {}),
      waitForConvexReadyFn: () => new Promise(() => {}),
      existsSyncFn: () => false,
      rmSyncFn: vi.fn(),
      writeFileSyncFn: vi.fn(),
      readConvexLocalConfigFn: () => null,
      writeConvexLocalConfigFn: vi.fn(),
      clearPortsFn,
      stdout: process.stdout,
      stderr: process.stderr,
      exitFn: processExit,
      disableAiFiles: false,
      prepareModuleForDev: false,
    } as Parameters<typeof runExampleDev>[0])

    await vi.waitFor(() => {
      expect(clearPortsFn).toHaveBeenCalledWith([4121, undefined, undefined], expect.any(Object))
      expect(clearPortsFn).toHaveBeenCalledWith([3214, 3215], expect.any(Object))
      expect(spawnFn).toHaveBeenCalledWith(
        'pnpm',
        ['exec', 'convex', 'dev', '--local', '--local-cloud-port', '3214', '--local-site-port', '3215'],
        expect.objectContaining({
          env: expect.objectContaining({ CONVEX_LOCAL_BACKEND_PORT: '3214' }),
        }),
      )
    })

    convex.emit('exit', 1, null)
    await pending
    expect(processExit).toHaveBeenCalledWith(1)
  })

  it('removes stale .env.local before starting convex', async () => {
    const convex = createChildProcess()
    const rmSyncFn = vi.fn()
    const spawnFn = vi.fn().mockReturnValue(convex)
    const clearPortsFn = vi.fn().mockResolvedValue(undefined)

    const processExit: (code?: string | number | null) => never = vi.fn(
      ((_) => undefined as never) as (code?: string | number | null) => never,
    )
    const pending = runExampleDev({
      cwd: '/repo/examples/01-public-todo',
      spawnFn,
      findAvailablePortPairFn: async () => 3210,
      isPortFreeFn: async () => false,
      waitForConvexEnvFn: () => new Promise(() => {}),
      waitForConvexReadyFn: () => new Promise(() => {}),
      existsSyncFn: () => true,
      rmSyncFn,
      writeFileSyncFn: vi.fn(),
      readConvexLocalConfigFn: () => null,
      writeConvexLocalConfigFn: vi.fn(),
      clearPortsFn,
      stdout: process.stdout,
      stderr: process.stderr,
      exitFn: processExit,
      disableAiFiles: false,
      prepareModuleForDev: false,
    } as Parameters<typeof runExampleDev>[0])

    await vi.waitFor(() =>
      expect(rmSyncFn).toHaveBeenCalledWith(
        expect.stringContaining('.env.local'),
      ),
    )

    convex.emit('exit', 1, null)
    await pending
    expect(processExit).toHaveBeenCalledWith(1)
  })

  it('preserves non-Convex values when rebuilding .env.local content', () => {
    const preserved = stripManagedConvexEnvVars({
      BETTER_AUTH_SECRET: 'stable-secret',
      SITE_URL: 'http://localhost:3000',
      CONVEX_URL: 'http://127.0.0.1:9999',
      CONVEX_SITE_URL: 'http://127.0.0.1:10000',
    })

    expect(serializeEnvFile(preserved)).toBe(
      'BETTER_AUTH_SECRET=stable-secret\nSITE_URL=http://localhost:3000',
    )
  })


  it('fails closed when Convex exits before readiness', async () => {
    const convex = createChildProcess()
    const spawnFn = vi.fn().mockReturnValue(convex)
    const clearPortsFn = vi.fn().mockResolvedValue(undefined)

    const processExit: (code?: string | number | null) => never = vi.fn(
      ((_) => undefined as never) as (code?: string | number | null) => never,
    )
    const pending = runExampleDev({
      cwd: '/repo/examples/01-public-todo',
      spawnFn,
      findAvailablePortPairFn: async () => 3210,
      isPortFreeFn: async () => false,
      waitForConvexEnvFn: async () => ({
        CONVEX_URL: 'http://127.0.0.1:3210',
        CONVEX_SITE_URL: 'http://127.0.0.1:3211',
      }),
      waitForConvexReadyFn: () => new Promise(() => {}),
      existsSyncFn: () => false,
      rmSyncFn: vi.fn(),
      writeFileSyncFn: vi.fn(),
      readConvexLocalConfigFn: () => null,
      writeConvexLocalConfigFn: vi.fn(),
      clearPortsFn,
      stdout: process.stdout,
      stderr: process.stderr,
      exitFn: processExit,
      disableAiFiles: false,
      prepareModuleForDev: false,
    } as Parameters<typeof runExampleDev>[0])

    await vi.waitFor(() => {
      expect(convex.listenerCount('exit')).toBeGreaterThan(0)
    })

    convex.emit('exit', 2, null)
    await pending

    expect(processExit).toHaveBeenCalledWith(1)
    expect(spawnFn).toHaveBeenCalledTimes(1)
  })
})
