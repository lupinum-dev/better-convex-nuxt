import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildExampleSourceFingerprint,
  buildLocalRuntimeEnv,
  clearPorts,
  convexGeneratedDir,
  convexLocalConfigPath,
  createExampleLocalEnv,
  createSignalHandler,
  findAvailablePortPair,
  getDesiredSiteUrl,
  getDesiredNuxtPort,
  materializeLocalStaticJwks,
  readStaticJwksFromLocalBackend,
  readDotenvFile,
  prefixStream,
  readConvexLocalConfig,
  readLocalEnvFile,
  resolveGeneratedSecretEnvValues,
  runExampleDev,
  selectLocalPortPair,
  serializeEnvFileContents,
  shouldResetLocalBackendForMissingGeneratedSecret,
  shouldResetLocalBackendForSourceFingerprint,
  stripLocalRuntimeEnvKeys,
  syncConvexLocalConfigPortPair,
  stopChild,
  waitForConvexReady,
  waitForLocalStaticJwks,
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

function createSucceededChildProcess(): FakeChildProcess {
  const child = createChildProcess()
  queueMicrotask(() => {
    child.exitCode = 0
    child.emit('exit', 0, null)
  })
  return child
}

function stripWorkspacePnpmArgs(args: string[]) {
  if (args[0] === '--dir' && typeof args[1] === 'string') {
    return args.slice(2)
  }
  return args
}

describe('example dev launcher', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('normalizes local Better Auth JWKS rows into static JWKS env JSON', () => {
    const jwks = readStaticJwksFromLocalBackend('/repo/examples/02-auth-todo', {
      spawnSyncFn: (() => ({
        status: 0,
        stdout: JSON.stringify([
          {
            json_value: JSON.stringify({
              _id: 'jwks-row-1',
              _creationTime: 12,
              createdAt: 11,
              publicKey: '{"kty":"RSA","n":"abc","e":"AQAB"}',
              privateKey: '"secret"',
              alg: 'RS256',
            }),
          },
        ]),
      })) as typeof import('node:child_process').spawnSync,
    })

    expect(jwks).toBe(
      JSON.stringify([
        {
          id: 'jwks-row-1',
          publicKey: '{"kty":"RSA","n":"abc","e":"AQAB"}',
          privateKey: '"secret"',
          createdAt: 11,
          alg: 'RS256',
        },
      ]),
    )
  })

  it('waits until local Better Auth JWKS rows exist', async () => {
    let hasRows = false
    const materializeLocalStaticJwksFn = vi.fn(async (siteUrl?: string) => {
      expect(siteUrl).toBe('http://127.0.0.1:3213')
      hasRows = true
    })

    await expect(
      waitForLocalStaticJwks('/repo/examples/02-auth-todo', {
        timeoutMs: 50,
        intervalMs: 1,
        siteUrl: 'http://127.0.0.1:3213',
        readStaticJwksFromLocalBackendFn: () => (hasRows ? '[{"id":"jwks-row-1"}]' : null),
        materializeLocalStaticJwksFn,
      }),
    ).resolves.toBe('[{"id":"jwks-row-1"}]')

    expect(materializeLocalStaticJwksFn).toHaveBeenCalledTimes(1)
  })

  it('warms the local Better Auth JWKS endpoint without failing on readiness races', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('site not ready'))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))

    await expect(
      materializeLocalStaticJwks('http://127.0.0.1:3213', { fetchFn }),
    ).resolves.toBeUndefined()
    await expect(
      materializeLocalStaticJwks('http://127.0.0.1:3213', { fetchFn }),
    ).resolves.toBeUndefined()

    expect(fetchFn).toHaveBeenNthCalledWith(
      1,
      new URL('/api/auth/convex/jwks', 'http://127.0.0.1:3213'),
      {
        method: 'GET',
        headers: {
          accept: 'application/json',
        },
      },
    )
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
      siteUrl: 'http://127.0.0.1:3000',
    })

    expect(env.CONVEX_LOCAL_BACKEND_PORT).toBe('3218')
    expect(env.CONVEX_URL).toBe('http://127.0.0.1:3218')
    expect(env.NUXT_PUBLIC_CONVEX_URL).toBe('http://127.0.0.1:3218')
    expect(env.CONVEX_SITE_URL).toBe('http://127.0.0.1:3219')
    expect(env.NUXT_PUBLIC_CONVEX_SITE_URL).toBe('http://127.0.0.1:3219')
    expect((env as Record<string, string | undefined>).SITE_URL).toBe('http://127.0.0.1:3000')
  })

  it('maps example numbers to deterministic Nuxt ports', () => {
    expect(getDesiredNuxtPort('/repo/examples/01-public-todo')).toBe(4121)
    expect(getDesiredNuxtPort('/repo/examples/02-auth-todo')).toBe(4122)
    expect(getDesiredNuxtPort('/repo/examples/09-doc-sharing')).toBe(4129)
    expect(getDesiredNuxtPort('/repo/examples/10-agency-portal')).toBe(4130)
    expect(getDesiredSiteUrl('/repo/examples/09-doc-sharing')).toBe('http://127.0.0.1:4129')
  })

  it('auto-generates local secrets for placeholder values in .env.example', () => {
    const resolved = resolveGeneratedSecretEnvValues({
      BETTER_AUTH_SECRET: 'replace-me',
      CONVEX_IDENTITY_FORWARDING_KEY: 'replace-me-with-a-long-random-shared-secret',
      SITE_URL: 'http://127.0.0.1:3000',
    }) as Record<string, string>

    expect(resolved.SITE_URL).toBeUndefined()
    expect(resolved.BETTER_AUTH_SECRET).not.toMatch(/replace.?me/i)
    expect(resolved.BETTER_AUTH_SECRET).toHaveLength(64) // 32 bytes hex
    expect(resolved.CONVEX_IDENTITY_FORWARDING_KEY).not.toMatch(/replace.?me/i)
    expect(resolved.CONVEX_IDENTITY_FORWARDING_KEY).not.toBe(resolved.BETTER_AUTH_SECRET)
  })

  it('keeps tracked example env files on the identity forwarding secret name', () => {
    const files = [
      'examples/03-team-workspace/.env.example',
      'examples/04-saas-platform/.env.example',
      'examples/07-mcp-reference/.env.example',
      'examples/07-mcp-reference/.env.local',
      'apps/harness/.env.local',
    ]

    for (const file of files) {
      const fullPath = resolve(process.cwd(), file)
      if (!existsSync(fullPath)) continue
      const source = readFileSync(fullPath, 'utf8')
      expect(source, file).toContain('CONVEX_IDENTITY_FORWARDING_KEY')
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

  it('pushes the desired SITE_URL into Convex deployment env vars', () => {
    const env = createExampleLocalEnv({
      cwd: '/repo/examples/02-auth-todo',
      port: 3212,
      readExampleDefaultsFileFn: () => ({
        BETTER_AUTH_SECRET: 'replace-me',
        SITE_URL: 'http://localhost:3000',
      }),
      readLocalEnvFileFn: () => ({
        BETTER_AUTH_SECRET: 'stable-secret',
        SITE_URL: 'http://localhost:9999',
      }),
    })

    expect(env.deploymentEnvVars).toMatchObject({
      BETTER_AUTH_SECRET: 'stable-secret',
      SITE_URL: 'http://127.0.0.1:4122',
    })
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

  it('resets the local backend when the stored example fingerprint is stale', () => {
    expect(shouldResetLocalBackendForSourceFingerprint('current', 'old')).toBe(true)
    expect(shouldResetLocalBackendForSourceFingerprint('current', 'current')).toBe(false)
    expect(shouldResetLocalBackendForSourceFingerprint('current', undefined)).toBe(true)
  })

  it('builds a stable fingerprint from example source files only', () => {
    const cwd = '/repo/examples/01-public-todo'
    const fileContents: Record<string, string> = {
      '/repo/examples/01-public-todo/convex/schema.ts': 'export default 1\n',
      '/repo/examples/01-public-todo/convex/functions.ts': 'export const x = 1\n',
      '/repo/examples/01-public-todo/convex/domain/todos.ts': 'export const y = 1\n',
      '/repo/examples/01-public-todo/shared/schemas/todo.ts': 'export const y = 1\n',
      '/repo/examples/01-public-todo/convex/_generated/api.ts': 'ignored\n',
    }
    const directoryEntries: Record<
      string,
      Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>
    > = {
      '/repo/examples/01-public-todo/convex': [
        { name: '_generated', isDirectory: () => true, isFile: () => false },
        { name: 'domain', isDirectory: () => true, isFile: () => false },
        { name: 'functions.ts', isDirectory: () => false, isFile: () => true },
        { name: 'schema.ts', isDirectory: () => false, isFile: () => true },
      ],
      '/repo/examples/01-public-todo/convex/domain': [
        { name: 'todos.ts', isDirectory: () => false, isFile: () => true },
      ],
      '/repo/examples/01-public-todo/shared': [
        { name: 'schemas', isDirectory: () => true, isFile: () => false },
      ],
      '/repo/examples/01-public-todo/shared/schemas': [
        { name: 'todo.ts', isDirectory: () => false, isFile: () => true },
      ],
    }

    const baseOptions = {
      existsSyncFn: (target: string) => target in directoryEntries || target in fileContents,
      readdirSyncFn: (target: string) => directoryEntries[target] ?? [],
      readFileSyncFn: (target: string) => fileContents[target] ?? '',
    }

    const initial = buildExampleSourceFingerprint(cwd, baseOptions)
    const repeated = buildExampleSourceFingerprint(cwd, baseOptions)
    const changed = buildExampleSourceFingerprint(cwd, {
      ...baseOptions,
      readFileSyncFn: (target: string) =>
        target === '/repo/examples/01-public-todo/shared/schemas/todo.ts'
          ? 'export const y = 2\n'
          : (fileContents[target] ?? ''),
    })

    expect(initial).toBe(repeated)
    expect(changed).not.toBe(initial)
  })

  it('reads local env files with standard parsing semantics', () => {
    const cwd = '/repo/examples/01-public-todo'
    const env = readLocalEnvFile(cwd)
    expect(env).toEqual({})
  })

  it('keeps quoted and hash-containing dotenv values intact', () => {
    const env = readDotenvFile('/repo/examples/01-public-todo', '.env.local', {
      existsSyncFn: () => true,
      readFileSyncFn: (() =>
        'BETTER_AUTH_SECRET="abc#123"\nEMPTY_VALUE=\nSITE_URL=http://localhost:4121\n') as unknown as typeof import('node:fs').readFileSync,
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

  it('updates the saved fingerprint even when the configured ports stay the same', () => {
    const writeFileSyncFn = vi.fn()

    syncConvexLocalConfigPortPair('/repo/examples/01-public-todo', 3210, {
      exampleSourceFingerprint: 'new-fingerprint',
      readConvexLocalConfigFn: () => ({
        ports: { cloud: 3210, site: 3211 },
        deploymentName: 'anonymous-agent',
        exampleSourceFingerprint: 'old-fingerprint',
      }),
      writeConvexLocalConfigFn: (cwd, config) => {
        writeFileSyncFn(convexLocalConfigPath(cwd), `${JSON.stringify(config)}\n`, 'utf8')
      },
    })

    expect(writeFileSyncFn).toHaveBeenCalledWith(
      expect.stringContaining('.convex/local/default/config.json'),
      `${JSON.stringify({
        ports: { cloud: 3210, site: 3211 },
        deploymentName: 'anonymous-agent',
        exampleSourceFingerprint: 'new-fingerprint',
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
    const spawnFn = vi.fn((command, args) => {
      const normalizedArgs = stripWorkspacePnpmArgs(args)
      if (command === 'pnpm' && normalizedArgs[1] === 'convex' && normalizedArgs[2] === 'env') {
        return createSucceededChildProcess()
      }
      return convex
    })
    const clearPortsFn = vi.fn().mockResolvedValue(undefined)
    const writeLocalEnvFileFn = vi.fn()

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
      writeLocalEnvFileFn,
      readConvexLocalConfigFn: () => null,
      writeConvexLocalConfigFn: vi.fn(),
      ensureLocalWorkspacePackageLinkFn: vi.fn(),
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
          '--dir',
          '/repo/examples/01-public-todo',
          'exec',
          'convex',
          'dev',
          '--local',
          '--local-cloud-port',
          '3214',
          '--local-site-port',
          '3215',
        ],
        expect.objectContaining({
          env: expect.objectContaining({
            BETTER_AUTH_SECRET: expect.any(String),
            CONVEX_LOCAL_BACKEND_PORT: '3214',
            SITE_URL: 'http://127.0.0.1:4121',
          }),
        }),
      )
    })

    expect(writeLocalEnvFileFn).toHaveBeenCalledWith(
      '/repo/examples/01-public-todo',
      expect.objectContaining({
        BETTER_AUTH_SECRET: expect.any(String),
      }),
    )

    convex.emit('exit', 1, null)
    await pending
    expect(processExit).toHaveBeenCalledWith(1)
  })

  it('bootstraps .env.local with app-owned values only before Convex configures the deployment', async () => {
    const convex = createChildProcess()
    const spawnFn = vi.fn((command, args) => {
      const normalizedArgs = stripWorkspacePnpmArgs(args)
      if (command === 'pnpm' && normalizedArgs[1] === 'convex' && normalizedArgs[2] === 'env') {
        return createSucceededChildProcess()
      }
      return convex
    })
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
      readLocalEnvFileFn: () => ({
        CONVEX_DEPLOYMENT: 'anonymous:stale-local-deployment',
        CONVEX_URL: 'http://127.0.0.1:9999',
        GITHUB_CLIENT_ID: 'user-owned',
      }),
      writeLocalEnvFileFn,
      readConvexLocalConfigFn: () => null,
      writeConvexLocalConfigFn: vi.fn(),
      ensureLocalWorkspacePackageLinkFn: vi.fn(),
      clearPortsFn,
      stdout: process.stdout,
      stderr: process.stderr,
      exitFn: processExit,
      disableAiFiles: false,
      prepareModuleForDev: false,
    } as Parameters<typeof runExampleDev>[0])

    await vi.waitFor(() => expect(writeLocalEnvFileFn).toHaveBeenCalledTimes(1))

    const [, writtenEnv] = writeLocalEnvFileFn.mock.calls[0] as [string, Record<string, string>]

    expect(writeLocalEnvFileFn).toHaveBeenCalledWith('/repo/examples/01-public-todo', writtenEnv)
    expect(writtenEnv).toMatchObject({
      BETTER_AUTH_SECRET: expect.any(String),
      GITHUB_CLIENT_ID: 'user-owned',
    })
    expect(writtenEnv).toMatchObject({
      CONVEX_DEPLOYMENT: 'anonymous:stale-local-deployment',
    })
    expect(writtenEnv).not.toHaveProperty('CONVEX_URL')
    expect(writtenEnv).not.toHaveProperty('SITE_URL')

    convex.emit('exit', 1, null)
    await pending
    expect(processExit).toHaveBeenCalledWith(1)
  })

  it('writes final launcher-managed runtime values after Convex selects the local deployment', async () => {
    const convex = createChildProcess()
    const nuxt = createChildProcess()
    const spawnFn = vi.fn((command, args) => {
      const normalizedArgs = stripWorkspacePnpmArgs(args)
      if (command === 'pnpm' && normalizedArgs[1] === 'convex' && normalizedArgs[2] === 'env') {
        return createSucceededChildProcess()
      }
      if (command === 'pnpm' && normalizedArgs[1] === 'convex' && normalizedArgs[2] === 'dev') {
        return convex
      }
      if (command === 'pnpm' && normalizedArgs[0] === 'run' && normalizedArgs[1] === 'dev:nuxt') {
        return nuxt
      }
      return createSucceededChildProcess()
    })
    const clearPortsFn = vi.fn().mockResolvedValue(undefined)
    const writeLocalEnvFileFn = vi.fn()
    const readLocalEnvFileFn = vi
      .fn()
      .mockReturnValueOnce({})
      .mockReturnValueOnce({ CONVEX_DEPLOYMENT: 'anonymous:anonymous-agent' })

    const processExit: (code?: string | number | null) => never = vi.fn(
      ((_) => undefined as never) as (code?: string | number | null) => never,
    )
    const pending = runExampleDev({
      cwd: '/repo/examples/01-public-todo',
      spawnFn,
      findAvailablePortPairFn: async () => 3210,
      isPortFreeFn: async () => false,
      waitForConvexReadyFn: async () => undefined,
      existsSyncFn: () => false,
      rmSyncFn: vi.fn(),
      readExampleDefaultsFileFn: () => ({}),
      readLocalEnvFileFn,
      writeLocalEnvFileFn,
      readConvexLocalConfigFn: () => null,
      writeConvexLocalConfigFn: vi.fn(),
      ensureLocalWorkspacePackageLinkFn: vi.fn(),
      clearPortsFn,
      stdout: process.stdout,
      stderr: process.stderr,
      exitFn: processExit,
      disableAiFiles: false,
      prepareModuleForDev: false,
    } as Parameters<typeof runExampleDev>[0])

    await vi.waitFor(() => expect(writeLocalEnvFileFn).toHaveBeenCalledTimes(2))

    expect(spawnFn).toHaveBeenCalledWith(
      'pnpm',
      [
        '--dir',
        '/repo/examples/01-public-todo',
        'exec',
        'convex',
        'env',
        'set',
        '--force',
        '--from-file',
        expect.any(String),
      ],
      expect.any(Object),
    )

    expect(spawnFn).toHaveBeenCalledWith(
      'pnpm',
      ['--dir', '/repo/examples/01-public-todo', 'run', 'dev:nuxt'],
      expect.objectContaining({
        env: expect.objectContaining({
          HOST: '127.0.0.1',
          NUXT_HOST: '127.0.0.1',
          PORT: '4121',
        }),
      }),
    )

    const [, finalEnv] = writeLocalEnvFileFn.mock.calls[1] as [string, Record<string, string>]
    expect(finalEnv).toMatchObject({
      CONVEX_DEPLOYMENT: 'anonymous:anonymous-agent',
      CONVEX_URL: 'http://127.0.0.1:3210',
      CONVEX_SITE_URL: 'http://127.0.0.1:3211',
      NUXT_PUBLIC_CONVEX_URL: 'http://127.0.0.1:3210',
      NUXT_PUBLIC_CONVEX_SITE_URL: 'http://127.0.0.1:3211',
      SITE_URL: 'http://127.0.0.1:4121',
    })

    nuxt.emit('exit', 1, null)
    await pending
    expect(processExit).toHaveBeenCalledWith(1)
  })

  it('writes temporary Convex env files in a private temp directory with restrictive mode', () => {
    const source = readFileSync(resolve(process.cwd(), 'scripts/example-dev.mjs'), 'utf8')

    expect(source).toContain("mkdtempSync(path.join(tmpdir(), 'trellis-convex-env-'))")
    expect(source).toContain('mode: 0o600')
    expect(source).toContain('rmSync(tmpDir, { recursive: true, force: true })')
    expect(source).not.toContain('convex-env-${process.pid}.env')
  })

  it('bootstraps auth examples with a dynamic JWKS sentinel before local startup', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'trellis-auth-example-'))
    mkdirSync(join(cwd, 'convex'), { recursive: true })
    writeFileSync(join(cwd, 'convex', 'auth.config.ts'), 'export default {}', 'utf8')

    const convex = createChildProcess()
    const nuxt = createChildProcess()
    const pushedEnvContents: string[] = []
    let convexDevEnv: Record<string, string> | undefined
    const spawnFn = vi.fn((command, args, options) => {
      const normalizedArgs = stripWorkspacePnpmArgs(args)
      if (command === 'pnpm' && normalizedArgs[1] === 'convex' && normalizedArgs[2] === 'dev') {
        convexDevEnv = options?.env as Record<string, string>
        return convex
      }
      if (command === 'pnpm' && normalizedArgs[1] === 'convex' && normalizedArgs[2] === 'env') {
        pushedEnvContents.push(readFileSync(String(normalizedArgs[6]), 'utf8'))
        return createSucceededChildProcess()
      }
      if (command === 'pnpm' && normalizedArgs[0] === 'run' && normalizedArgs[1] === 'dev:nuxt') {
        return nuxt
      }
      return createSucceededChildProcess()
    })
    const readLocalEnvFileFn = vi
      .fn()
      .mockReturnValueOnce({})
      .mockReturnValueOnce({ CONVEX_DEPLOYMENT: 'anonymous:anonymous-agent' })
    const processExit: (code?: string | number | null) => never = vi.fn(
      ((_) => undefined as never) as (code?: string | number | null) => never,
    )

    const pending = runExampleDev({
      cwd,
      spawnFn,
      findAvailablePortPairFn: async () => 3212,
      isPortFreeFn: async () => false,
      waitForConvexReadyFn: async () => undefined,
      existsSyncFn: () => false,
      rmSyncFn: vi.fn(),
      readExampleDefaultsFileFn: () => ({ BETTER_AUTH_SECRET: 'replace-me' }),
      readLocalEnvFileFn,
      writeLocalEnvFileFn: vi.fn(),
      readConvexLocalConfigFn: () => null,
      writeConvexLocalConfigFn: vi.fn(),
      clearPortsFn: vi.fn().mockResolvedValue(undefined),
      stdout: process.stdout,
      stderr: process.stderr,
      exitFn: processExit,
      disableAiFiles: false,
      prepareModuleForDev: false,
    } as Parameters<typeof runExampleDev>[0])

    await vi.waitFor(() => expect(pushedEnvContents).toHaveLength(1))
    expect(convexDevEnv).toMatchObject({
      BETTER_AUTH_SECRET: expect.any(String),
      JWKS: '__TRELLIS_LOCAL_JWKS_BOOTSTRAP__',
      SITE_URL: 'http://127.0.0.1:4126',
    })
    expect(pushedEnvContents[0]).toContain('BETTER_AUTH_SECRET=')
    expect(pushedEnvContents[0]).toContain('JWKS=__TRELLIS_LOCAL_JWKS_BOOTSTRAP__')

    nuxt.emit('exit', 1, null)
    await pending
    rmSync(cwd, { recursive: true, force: true })
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
    const spawnFn = vi.fn((command, args) => {
      const normalizedArgs = stripWorkspacePnpmArgs(args)
      if (command === 'pnpm' && normalizedArgs[1] === 'convex' && normalizedArgs[2] === 'env') {
        return createSucceededChildProcess()
      }
      return convex
    })
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
      ensureLocalWorkspacePackageLinkFn: vi.fn(),
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
