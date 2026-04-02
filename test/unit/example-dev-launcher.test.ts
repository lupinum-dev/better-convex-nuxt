import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildLocalRuntimeEnv,
  clearPorts,
  convexGeneratedDir,
  convexLocalConfigPath,
  createSignalHandler,
  findAvailablePortPair,
  getDesiredSiteUrl,
  getDesiredNuxtPort,
  readDotenvFile,
  prefixStream,
  readConvexLocalConfig,
  readLocalEnvFile,
  resolveGeneratedSecretEnvValues,
  runExampleDev,
  selectLocalPortPair,
  serializeEnvFileContents,
  shouldResetLocalBackendForMissingGeneratedSecret,
  stripLocalRuntimeEnvKeys,
  syncConvexLocalConfigPortPair,
  stopChild,
  waitForConvexReady,
  writeLocalEnvFile,
} from '../../scripts/example-dev.mjs'

class FakeStream extends EventEmitter {}
const LEGACY_TRUSTED_CALLER_ENV_VAR = ['CONVEX', 'SERVICE', 'KEY'].join('_')

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
      isPortFreeFn: async (candidate) => freePorts.has(candidate),
    })

    expect(port).toBe(3214)
  })

  it('clears listening processes on the requested ports', async () => {
    const killed: Array<{ pid: number; signal: NodeJS.Signals }> = []
    const portState = new Map<number, number[]>([
      [3000, [111]],
      [3210, [222, 333]],
      [3211, []],
    ])

    await clearPorts([3000, 3210, 3211, 3210], {
      findListeningPidsFn: (port) => portState.get(port) ?? [],
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

  it('derives local runtime env from the chosen port', () => {
    const env = buildLocalRuntimeEnv({
      port: 3218,
      siteUrl: 'http://localhost:3000',
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

  it('auto-generates local secrets for placeholder values in .env.example', () => {
    const resolved = resolveGeneratedSecretEnvValues({
      BETTER_AUTH_SECRET: 'replace-me',
      CONVEX_TRUSTED_CALLER_KEY: 'replace-me-with-a-long-random-shared-secret',
      SITE_URL: 'http://127.0.0.1:3000',
    }) as Record<string, string>

    expect(resolved.SITE_URL).toBeUndefined()
    expect(resolved.BETTER_AUTH_SECRET).not.toMatch(/replace.?me/i)
    expect(resolved.BETTER_AUTH_SECRET).toHaveLength(64) // 32 bytes hex
    expect(resolved.CONVEX_TRUSTED_CALLER_KEY).not.toMatch(/replace.?me/i)
    expect(resolved.CONVEX_TRUSTED_CALLER_KEY).not.toBe(resolved.BETTER_AUTH_SECRET)
  })

  it('keeps tracked example env files on the trusted caller secret name', () => {
    const files = [
      'examples/03-team-workspace/.env.example',
      'examples/04-saas-platform/.env.example',
      'examples/07-mcp-reference/.env.example',
      'examples/07-mcp-reference/.env.local',
      'test/internal-harness/.env.local',
    ]

    for (const file of files) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8')
      expect(source, file).toContain('CONVEX_TRUSTED_CALLER_KEY')
      expect(source, file).not.toContain(LEGACY_TRUSTED_CALLER_ENV_VAR)
    }
  })

  it('reuses stored local secrets when placeholders are resolved', () => {
    const resolved = resolveGeneratedSecretEnvValues(
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
    expect(resolved.SITE_URL).toBeUndefined()
  })

  it('strips local runtime keys from persisted env values', () => {
    expect(
      stripLocalRuntimeEnvKeys({
        BETTER_AUTH_SECRET: 'stable-secret',
        SITE_URL: 'http://localhost:3000',
        CONVEX_URL: 'http://127.0.0.1:3210',
        CONVEX_SITE_URL: 'http://127.0.0.1:3211',
        CONVEX_DEPLOYMENT: 'anonymous:demo',
      }),
    ).toEqual({
      BETTER_AUTH_SECRET: 'stable-secret',
    })
  })

  it('serializes env files without dropping values', () => {
    expect(
      serializeEnvFileContents({
        BETTER_AUTH_SECRET: 'abc#123',
        EMPTY_VALUE: '',
        SITE_URL: 'http://localhost:3000',
      }),
    ).toBe('BETTER_AUTH_SECRET="abc#123"\nEMPTY_VALUE=""\nSITE_URL=http://localhost:3000')
  })

  it('resets the local backend only when a generated auth secret has not been stored yet', () => {
    expect(
      shouldResetLocalBackendForMissingGeneratedSecret(
        { BETTER_AUTH_SECRET: 'replace-me', SITE_URL: 'http://localhost:3000' },
        {},
      ),
    ).toBe(true)

    expect(
      shouldResetLocalBackendForMissingGeneratedSecret(
        { BETTER_AUTH_SECRET: 'replace-me', SITE_URL: 'http://localhost:3000' },
        { BETTER_AUTH_SECRET: 'stable-secret' },
      ),
    ).toBe(false)
  })

  it('reads local env files with standard parsing semantics', () => {
    const cwd = '/repo/examples/01-public-todo'
    const env = readLocalEnvFile(cwd)
    expect(env).toEqual({})
  })

  it('keeps quoted and hash-containing dotenv values intact', () => {
    const env = readDotenvFile('/repo/examples/01-public-todo', '.env.local', {
      existsSyncFn: () => true,
      readFileSyncFn: ((() =>
        'BETTER_AUTH_SECRET="abc#123"\nEMPTY_VALUE=\nSITE_URL=http://localhost:4121\n') as unknown) as typeof import('node:fs').readFileSync,
    })

    expect(env).toEqual({
      BETTER_AUTH_SECRET: 'abc#123',
      EMPTY_VALUE: '',
      SITE_URL: 'http://localhost:4121',
    })
  })

  it('writes local env files to the Convex-compatible path', () => {
    const writeFileSyncFn = vi.fn()

    writeLocalEnvFile(
      '/repo/examples/01-public-todo',
      {
        CONVEX_URL: 'http://127.0.0.1:3210',
        BETTER_AUTH_SECRET: 'abc#123',
      },
      { writeFileSyncFn },
    )

    expect(writeFileSyncFn).toHaveBeenCalledWith(
      '/repo/examples/01-public-todo/.env.local',
      expect.stringContaining('BETTER_AUTH_SECRET="abc#123"\nCONVEX_URL=http://127.0.0.1:3210\n'),
      'utf8',
    )
  })

  it('reads project-local Convex config when present', () => {
    const cwd = '/repo/examples/01-public-todo'
    const config = readConvexLocalConfig(cwd, {
      existsSyncFn: () => true,
      readFileSyncFn: (() =>
        '{"ports":{"cloud":3210,"site":3211},"deploymentName":"anonymous-agent"}') as unknown as typeof import('node:fs').readFileSync,
    })

    expect(config).toEqual({
      ports: { cloud: 3210, site: 3211 },
      deploymentName: 'anonymous-agent',
    })
  })

  it('reuses the saved Convex port pair when it is still free', async () => {
    const port = await selectLocalPortPair({
      cwd: '/repo/examples/01-public-todo',
      readConvexLocalConfigFn: () => ({
        ports: { cloud: 3216, site: 3217 },
      }),
      isPortFreeFn: async (candidate) => candidate === 3216 || candidate === 3217,
      findAvailablePortPairFn: async () => 3220,
    } as Parameters<typeof selectLocalPortPair>[0])

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
    await new Promise((resolve) => setTimeout(resolve, 0))

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
      waitForConvexReadyFn: () => new Promise(() => {}),
      existsSyncFn: () => false,
      rmSyncFn: vi.fn(),
      readExampleDefaultsFileFn: () => ({ BETTER_AUTH_SECRET: 'replace-me' }),
      readLocalEnvFileFn: () => ({}),
      writeLocalEnvFileFn: vi.fn(),
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
        [
          'exec',
          'convex',
          'dev',
          '--local',
          '--local-cloud-port',
          '3214',
          '--local-site-port',
          '3215',
          '--env-file',
          '/repo/examples/01-public-todo/.env.local',
        ],
        expect.objectContaining({
          env: expect.objectContaining({ CONVEX_LOCAL_BACKEND_PORT: '3214' }),
        }),
      )
    })

    convex.emit('exit', 1, null)
    await pending
    expect(processExit).toHaveBeenCalledWith(1)
  })

  it('writes launcher-managed local values into .env.local while preserving app-owned values', async () => {
    const convex = createChildProcess()
    const spawnFn = vi.fn().mockReturnValue(convex)
    const clearPortsFn = vi.fn().mockResolvedValue(undefined)
    const rmSyncFn = vi.fn()
    const writeLocalEnvFileFn = vi.fn()

    const processExit: (code?: string | number | null) => never = vi.fn(
      ((_) => undefined as never) as (code?: string | number | null) => never,
    )
    const pending = runExampleDev({
      cwd: '/repo/examples/01-public-todo',
      spawnFn,
      findAvailablePortPairFn: async () => 3210,
      isPortFreeFn: async () => false,
      waitForConvexReadyFn: () => new Promise(() => {}),
      existsSyncFn: () => true,
      rmSyncFn,
      readExampleDefaultsFileFn: () => ({ BETTER_AUTH_SECRET: 'replace-me' }),
      readLocalEnvFileFn: () => ({ GITHUB_CLIENT_ID: 'user-owned' }),
      writeLocalEnvFileFn,
      readConvexLocalConfigFn: () => null,
      writeConvexLocalConfigFn: vi.fn(),
      clearPortsFn,
      stdout: process.stdout,
      stderr: process.stderr,
      exitFn: processExit,
      disableAiFiles: false,
      prepareModuleForDev: false,
    } as Parameters<typeof runExampleDev>[0])

    await vi.waitFor(() => expect(writeLocalEnvFileFn).toHaveBeenCalledTimes(1))

    expect(writeLocalEnvFileFn).toHaveBeenCalledWith(
      '/repo/examples/01-public-todo',
      expect.objectContaining({
        BETTER_AUTH_SECRET: expect.any(String),
        CONVEX_URL: 'http://127.0.0.1:3210',
        GITHUB_CLIENT_ID: 'user-owned',
        SITE_URL: 'http://localhost:4121',
      }),
    )

    convex.emit('exit', 1, null)
    await pending
    expect(processExit).toHaveBeenCalledWith(1)
  })

  it('preserves app-owned values when filtering local runtime keys', () => {
    const preserved = stripLocalRuntimeEnvKeys({
      BETTER_AUTH_SECRET: 'stable-secret',
      SITE_URL: 'http://localhost:3000',
      CONVEX_URL: 'http://127.0.0.1:9999',
      CONVEX_SITE_URL: 'http://127.0.0.1:10000',
    })

    expect(serializeEnvFileContents(preserved)).toBe('BETTER_AUTH_SECRET=stable-secret')
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
      waitForConvexReadyFn: () => new Promise(() => {}),
      existsSyncFn: () => false,
      rmSyncFn: vi.fn(),
      readExampleDefaultsFileFn: () => ({ BETTER_AUTH_SECRET: 'replace-me' }),
      readLocalEnvFileFn: () => ({}),
      writeLocalEnvFileFn: vi.fn(),
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
