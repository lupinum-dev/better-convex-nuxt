import { EventEmitter } from 'node:events'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildExampleRuntimeEnv,
  convexGeneratedDir,
  createSignalHandler,
  findAvailablePortPair,
  parseEnvFile,
  prefixStream,
  resolveConvexEnvVars,
  runExampleDev,
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

  it('auto-generates secrets for placeholder values in .env.example', () => {
    const resolved = resolveConvexEnvVars({
      BETTER_AUTH_SECRET: 'replace-me',
      CONVEX_SERVICE_KEY: 'replace-me-with-a-long-random-shared-secret',
      SITE_URL: 'http://127.0.0.1:3000',
    })

    expect(resolved.SITE_URL).toBe('http://127.0.0.1:3000')
    expect(resolved.BETTER_AUTH_SECRET).not.toMatch(/replace.?me/i)
    expect(resolved.BETTER_AUTH_SECRET).toHaveLength(64) // 32 bytes hex
    expect(resolved.CONVEX_SERVICE_KEY).not.toMatch(/replace.?me/i)
    expect(resolved.CONVEX_SERVICE_KEY).not.toBe(resolved.BETTER_AUTH_SECRET)
  })

  it('reads Convex deployment env from .env.local', () => {
    const cwd = '/repo/examples/01-public-todo'
    const env = parseEnvFile(cwd, '.env.local')
    expect(env).toEqual({})
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

    const processExit: (code?: string | number | null) => never = vi.fn(
      ((_) => undefined as never) as (code?: string | number | null) => never,
    )
    const pending = runExampleDev({
      cwd: '/repo/examples/01-public-todo',
      spawnFn,
      findAvailablePortPairFn: async () => 3214,
      waitForConvexEnvFn: () => new Promise(() => {}),
      waitForConvexReadyFn: () => new Promise(() => {}),
      existsSyncFn: () => false,
      rmSyncFn: vi.fn(),
      stdout: process.stdout,
      stderr: process.stderr,
      exitFn: processExit,
      disableAiFiles: false,
    })

    await vi.waitFor(() => {
      expect(spawnFn).toHaveBeenCalledWith(
        'npx',
        ['convex', 'dev', '--local', '--local-cloud-port', '3214', '--local-site-port', '3215'],
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

    const processExit: (code?: string | number | null) => never = vi.fn(
      ((_) => undefined as never) as (code?: string | number | null) => never,
    )
    const pending = runExampleDev({
      cwd: '/repo/examples/01-public-todo',
      spawnFn,
      findAvailablePortPairFn: async () => 3210,
      waitForConvexEnvFn: () => new Promise(() => {}),
      waitForConvexReadyFn: () => new Promise(() => {}),
      existsSyncFn: () => true,
      rmSyncFn,
      stdout: process.stdout,
      stderr: process.stderr,
      exitFn: processExit,
      disableAiFiles: false,
    })

    await vi.waitFor(() =>
      expect(rmSyncFn).toHaveBeenCalledWith(
        expect.stringContaining('.env.local'),
      ),
    )

    convex.emit('exit', 1, null)
    await pending
    expect(processExit).toHaveBeenCalledWith(1)
  })

  it('fails closed when Convex exits before readiness', async () => {
    const convex = createChildProcess()
    const spawnFn = vi.fn().mockReturnValue(convex)

    const processExit: (code?: string | number | null) => never = vi.fn(
      ((_) => undefined as never) as (code?: string | number | null) => never,
    )
    const pending = runExampleDev({
      cwd: '/repo/examples/01-public-todo',
      spawnFn,
      findAvailablePortPairFn: async () => 3210,
      waitForConvexEnvFn: async () => ({
        CONVEX_URL: 'http://127.0.0.1:3210',
        CONVEX_SITE_URL: 'http://127.0.0.1:3211',
      }),
      waitForConvexReadyFn: () => new Promise(() => {}),
      existsSyncFn: () => false,
      rmSyncFn: vi.fn(),
      stdout: process.stdout,
      stderr: process.stderr,
      exitFn: processExit,
      disableAiFiles: false,
    })

    await vi.waitFor(() => {
      expect(convex.listenerCount('exit')).toBeGreaterThan(0)
    })

    convex.emit('exit', 2, null)
    await pending

    expect(processExit).toHaveBeenCalledWith(1)
    expect(spawnFn).toHaveBeenCalledTimes(1)
  })
})
