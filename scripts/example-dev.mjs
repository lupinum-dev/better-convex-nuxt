#!/usr/bin/env node

import { execFileSync, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..')

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT_START = 3210
const DEFAULT_PORT_END = 3298
const READINESS_TIMEOUT_MS = 25_000
const SHUTDOWN_GRACE_MS = 3_000

function colorize(text, code) {
  if (process.env.NO_COLOR) return text
  return `\u001B[${code}m${text}\u001B[0m`
}

export function buildExampleRuntimeEnv({ port, baseEnv = process.env }) {
  const url = `http://${DEFAULT_HOST}:${port}`
  const siteUrl = `http://${DEFAULT_HOST}:${port + 1}`

  return {
    ...baseEnv,
    CONVEX_LOCAL_BACKEND_PORT: String(port),
    CONVEX_URL: url,
    NUXT_PUBLIC_CONVEX_URL: url,
    CONVEX_SITE_URL: siteUrl,
    NUXT_PUBLIC_CONVEX_SITE_URL: siteUrl,
  }
}

export function parseEnvFile(cwd, fileName = '.env.local') {
  const filePath = path.join(cwd, fileName)
  if (!existsSync(filePath)) return {}

  const values = {}
  const content = readFileSync(filePath, 'utf8')

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const [rawKey, ...rest] = trimmed.split('=')
    if (!rawKey || rest.length === 0) continue

    const key = rawKey.trim()
    const value = rest.join('=').split('#')[0]?.trim()
    if (!value) continue
    values[key] = value
  }

  return values
}

export function serializeEnvFile(values) {
  return Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
}

const MANAGED_CONVEX_ENV_KEYS = new Set([
  'CONVEX_DEPLOYMENT',
  'CONVEX_URL',
  'CONVEX_SITE_URL',
  'NUXT_PUBLIC_CONVEX_URL',
  'NUXT_PUBLIC_CONVEX_SITE_URL',
])

export function stripManagedConvexEnvVars(values) {
  return Object.fromEntries(
    Object.entries(values).filter(([key]) => !MANAGED_CONVEX_ENV_KEYS.has(key)),
  )
}

export function shouldResetLocalBackendForMissingSecret(exampleEnv, preservedEnvLocal) {
  return (
    /replace.?me/i.test(exampleEnv.BETTER_AUTH_SECRET ?? '') &&
    !preservedEnvLocal.BETTER_AUTH_SECRET
  )
}

/**
 * Reads `.env.example` and resolves placeholder values to generated secrets.
 * Any value matching /replace.?me/i is replaced with a random 32-byte hex string.
 */
export function resolveConvexEnvVars(parsed, existing = {}) {
  const resolved = {}
  for (const [key, value] of Object.entries(parsed)) {
    const existingValue = existing[key]
    if (/replace.?me/i.test(value) && existingValue && !/replace.?me/i.test(existingValue)) {
      resolved[key] = existingValue
      continue
    }

    resolved[key] = /replace.?me/i.test(value) ? randomBytes(32).toString('hex') : value
  }
  return resolved
}

export async function isPortFree(port, host = DEFAULT_HOST) {
  return await new Promise((resolve) => {
    const socket = new net.Socket()
    let settled = false

    const finish = (value) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(value)
    }

    socket.setTimeout(250)
    socket.once('connect', () => finish(false))
    socket.once('timeout', () => finish(true))
    socket.once('error', (error) => {
      if (error && typeof error === 'object' && 'code' in error) {
        const code = error.code
        if (code === 'ECONNREFUSED' || code === 'EHOSTUNREACH' || code === 'ENETUNREACH') {
          finish(true)
          return
        }
      }
      finish(false)
    })
    socket.connect(port, host)
  })
}

export async function findAvailablePortPair({
  start = DEFAULT_PORT_START,
  end = DEFAULT_PORT_END,
  isPortFreeFn = isPortFree,
} = {}) {
  for (let port = start; port <= end; port += 2) {
    const backendFree = await isPortFreeFn(port)
    if (!backendFree) continue

    const siteFree = await isPortFreeFn(port + 1)
    if (siteFree) return port
  }

  throw new Error(`Could not find a free local Convex port pair in ${start}-${end + 1}.`)
}

export function getDesiredNuxtPort(cwd = process.cwd()) {
  const baseName = path.basename(cwd)
  const match = baseName.match(/^(\d+)-/)
  if (!match) return 4126

  const exampleNumber = Number.parseInt(match[1], 10)
  if (!Number.isInteger(exampleNumber) || exampleNumber < 1) return 4126

  return 4120 + exampleNumber
}

export function getDesiredSiteUrl(cwd = process.cwd()) {
  return `http://localhost:${getDesiredNuxtPort(cwd)}`
}

export function convexGeneratedDir(cwd) {
  return path.join(cwd, 'convex', '_generated')
}

export function convexLocalConfigPath(cwd) {
  return path.join(cwd, '.convex', 'local', 'default', 'config.json')
}

export function convexLocalSqlitePath(cwd) {
  return path.join(cwd, '.convex', 'local', 'default', 'convex_local_backend.sqlite3')
}

export function readConvexLocalConfig(
  cwd,
  { existsSyncFn = existsSync, readFileSyncFn = readFileSync } = {},
) {
  const configPath = convexLocalConfigPath(cwd)
  if (!existsSyncFn(configPath)) return null

  try {
    return JSON.parse(readFileSyncFn(configPath, 'utf8'))
  } catch {
    return null
  }
}

export function writeConvexLocalConfig(cwd, config, { writeFileSyncFn = writeFileSync } = {}) {
  writeFileSyncFn(convexLocalConfigPath(cwd), `${JSON.stringify(config)}\n`, 'utf8')
}

export async function selectExamplePortPair({
  cwd,
  findAvailablePortPairFn = findAvailablePortPair,
  isPortFreeFn = isPortFree,
  readConvexLocalConfigFn = readConvexLocalConfig,
} = {}) {
  const existingConfig = readConvexLocalConfigFn(cwd)
  const configuredCloudPort = existingConfig?.ports?.cloud
  const configuredSitePort = existingConfig?.ports?.site

  if (
    Number.isInteger(configuredCloudPort) &&
    Number.isInteger(configuredSitePort) &&
    (await isPortFreeFn(configuredCloudPort)) &&
    (await isPortFreeFn(configuredSitePort))
  ) {
    return configuredCloudPort
  }

  return await findAvailablePortPairFn()
}

export function syncConvexLocalConfigPortPair(
  cwd,
  port,
  {
    readConvexLocalConfigFn = readConvexLocalConfig,
    writeConvexLocalConfigFn = writeConvexLocalConfig,
  } = {},
) {
  const config = readConvexLocalConfigFn(cwd)
  if (!config?.ports) return

  if (config.ports.cloud === port && config.ports.site === port + 1) return

  writeConvexLocalConfigFn(cwd, {
    ...config,
    ports: {
      ...config.ports,
      cloud: port,
      site: port + 1,
    },
  })
}

export function findListeningPids(port) {
  try {
    const output = execFileSync('lsof', ['-nP', `-tiTCP:${port}`, '-sTCP:LISTEN'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return output
      .split(/\r?\n/)
      .map((line) => Number.parseInt(line.trim(), 10))
      .filter(Number.isInteger)
  } catch {
    return []
  }
}

export async function clearPorts(
  ports,
  {
    findListeningPidsFn = findListeningPids,
    killFn = process.kill.bind(process),
    sleepFn = sleep,
    stdout = process.stdout,
  } = {},
) {
  const uniquePorts = [...new Set(ports.filter((port) => Number.isInteger(port) && port > 0))]

  for (const port of uniquePorts) {
    const pids = [...new Set(findListeningPidsFn(port))]
    if (pids.length === 0) continue

    const label = colorize('system'.padEnd(6), '33')
    stdout.write(`${label} clearing port ${port} (pids: ${pids.join(', ')})\n`)

    for (const pid of pids) {
      try {
        killFn(pid, 'SIGTERM')
      } catch {
        // Ignore processes that exit before the signal is delivered.
      }
    }

    await sleepFn(300)

    const remainingPids = [...new Set(findListeningPidsFn(port))]
    for (const pid of remainingPids) {
      try {
        killFn(pid, 'SIGKILL')
      } catch {
        // Ignore processes that exited during the grace period.
      }
    }
  }
}

export async function waitForPort(
  port,
  { host = DEFAULT_HOST, timeoutMs = READINESS_TIMEOUT_MS, intervalMs = 100, connectFn } = {},
) {
  const deadline = Date.now() + timeoutMs
  const connect =
    connectFn ??
    ((currentPort, currentHost) =>
      new Promise((resolve) => {
        const socket = new net.Socket()
        let settled = false

        const finish = (value) => {
          if (settled) return
          settled = true
          socket.destroy()
          resolve(value)
        }

        socket.setTimeout(500)
        socket.once('connect', () => finish(true))
        socket.once('timeout', () => finish(false))
        socket.once('error', () => finish(false))
        socket.connect(currentPort, currentHost)
      }))

  while (Date.now() < deadline) {
    if (await connect(port, host)) return
    await sleep(intervalMs)
  }

  throw new Error(`Timed out waiting for local Convex backend on port ${port}.`)
}

export async function waitForGeneratedDir(
  cwd,
  { timeoutMs = READINESS_TIMEOUT_MS, intervalMs = 100, existsSyncFn = existsSync } = {},
) {
  const deadline = Date.now() + timeoutMs
  const generatedDir = convexGeneratedDir(cwd)

  while (Date.now() < deadline) {
    if (existsSyncFn(generatedDir)) return generatedDir
    await sleep(intervalMs)
  }

  throw new Error(`Timed out waiting for Convex codegen output at ${generatedDir}.`)
}

export async function waitForConvexReady(cwd, port, options = {}) {
  await waitForPort(port, options)
  return await waitForGeneratedDir(cwd, options)
}

export async function waitForConvexEnv(
  cwd,
  {
    timeoutMs = READINESS_TIMEOUT_MS,
    intervalMs = 100,
    parseEnvFileFn = parseEnvFile,
    // When set, stale .env.local entries that don't contain this substring are skipped.
    // Pass `:${port}` to reject entries written by a previous run on a different port.
    expectedUrl,
  } = {},
) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const env = parseEnvFileFn(cwd)
    if (env.CONVEX_URL && env.CONVEX_SITE_URL) {
      if (!expectedUrl || env.CONVEX_URL.includes(expectedUrl)) return env
    }
    await sleep(intervalMs)
  }

  throw new Error(`Timed out waiting for Convex environment in ${path.join(cwd, '.env.local')}.`)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function createLinePrefix(label, colorCode) {
  return `${colorize(label.padEnd(6), colorCode)} `
}

export function prefixStream(stream, label, colorCode, target = process.stdout) {
  let remainder = ''
  const prefix = createLinePrefix(label, colorCode)

  const writeChunk = (chunk) => {
    remainder += chunk.toString()
    const lines = remainder.split(/\r?\n/)
    remainder = lines.pop() ?? ''

    for (const line of lines) {
      target.write(`${prefix}${line}\n`)
    }
  }

  const flush = () => {
    if (!remainder) return
    target.write(`${prefix}${remainder}\n`)
    remainder = ''
  }

  stream.on('data', writeChunk)
  stream.on('end', flush)

  return flush
}

export function createSignalHandler({ signalName = 'signal', stderr = process.stderr, shutdown }) {
  return () => {
    const label = colorize('system'.padEnd(6), '33')
    stderr.write(`${label} received ${signalName}, shutting down\n`)
    void shutdown(0)
  }
}

function createProcessExitError(name, code, signal) {
  const detail = signal ? `signal ${signal}` : `code ${code ?? 'unknown'}`
  return new Error(`${name} exited unexpectedly (${detail}).`)
}

export async function stopChild(child, graceMs = SHUTDOWN_GRACE_MS) {
  if (!child || child.exitCode !== null || child.killed) return

  const exitPromise = onceExit(child)
  child.kill('SIGTERM')

  await Promise.race([
    exitPromise,
    sleep(graceMs).then(() => {
      if (child.exitCode === null && !child.killed) child.kill('SIGKILL')
    }),
  ])

  await exitPromise.catch(() => {})
}

function onceExit(child) {
  return new Promise((resolve) => {
    child.once('exit', (code, signal) => resolve({ code, signal }))
  })
}

async function runCheckedCommand({ label, spawnFn, cwd, env, command, args, stdout, stderr }) {
  const child = spawnFn(command, args, {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const flushStdout = prefixStream(child.stdout, label, '36', stdout)
  const flushStderr = prefixStream(child.stderr, label, '36', stderr)
  const { code, signal } = await onceExit(child)
  flushStdout()
  flushStderr()

  if (code !== 0) {
    throw createProcessExitError(`${command} ${args.join(' ')}`, code, signal)
  }
}

async function pushConvexEnvVars({ vars, cwd, spawnFn, env, stdout, stderr }) {
  const tmpPath = path.join(tmpdir(), `convex-env-${process.pid}.env`)
  writeFileSync(
    tmpPath,
    Object.entries(vars)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n'),
    'utf8',
  )
  try {
    await runCheckedCommand({
      label: 'convex',
      spawnFn,
      cwd,
      env,
      command: 'pnpm',
      args: ['exec', 'convex', 'env', 'set', '--force', '--from-file', tmpPath],
      stdout,
      stderr,
    })
  } finally {
    try {
      unlinkSync(tmpPath)
    } catch {
      // Ignore temp-file cleanup races.
    }
  }
}

async function prepareLocalModuleForDev({ spawnFn, stdout, stderr }) {
  const sysLabel = colorize('system'.padEnd(6), '33')
  stdout.write(`${sysLabel} preparing local @lupinum/trellis module\n`)
  await runCheckedCommand({
    label: 'build',
    spawnFn,
    cwd: REPO_ROOT,
    env: process.env,
    command: 'pnpm',
    args: ['run', 'dev:prepare'],
    stdout,
    stderr,
  })
}

export async function runExampleDev({
  cwd = process.cwd(),
  spawnFn = spawn,
  findAvailablePortPairFn = findAvailablePortPair,
  isPortFreeFn = isPortFree,
  waitForConvexEnvFn = waitForConvexEnv,
  waitForConvexReadyFn = waitForConvexReady,
  existsSyncFn = existsSync,
  rmSyncFn = rmSync,
  writeFileSyncFn = writeFileSync,
  readConvexLocalConfigFn = readConvexLocalConfig,
  writeConvexLocalConfigFn = writeConvexLocalConfig,
  clearPortsFn = clearPorts,
  stdout = process.stdout,
  stderr = process.stderr,
  exitFn = process.exit,
  disableAiFiles = true,
  prepareModuleForDev = true,
} = {}) {
  if (prepareModuleForDev) {
    await prepareLocalModuleForDev({ spawnFn, stdout, stderr })
  }

  const desiredNuxtPort = getDesiredNuxtPort(cwd)
  const configuredPorts = readConvexLocalConfigFn(cwd)?.ports
  await clearPortsFn([desiredNuxtPort, configuredPorts?.cloud, configuredPorts?.site], { stdout })

  // Reuse configured ports when possible, otherwise move the saved deployment to a free pair.
  const port = await selectExamplePortPair({
    cwd,
    findAvailablePortPairFn,
    isPortFreeFn,
    readConvexLocalConfigFn,
  })

  await clearPortsFn([port, port + 1], { stdout })

  syncConvexLocalConfigPortPair(cwd, port, {
    readConvexLocalConfigFn,
    writeConvexLocalConfigFn,
  })

  const preservedEnvLocal = stripManagedConvexEnvVars(parseEnvFile(cwd))
  const exampleEnv = {
    ...parseEnvFile(cwd, '.env.example'),
    SITE_URL: getDesiredSiteUrl(cwd),
  }

  // Remove stale Convex runtime entries so waitForConvexEnv cannot return values from a previous run.
  const envLocalPath = path.join(cwd, '.env.local')
  if (existsSyncFn(envLocalPath)) {
    rmSyncFn(envLocalPath)
  }

  const convexVars = resolveConvexEnvVars(exampleEnv, preservedEnvLocal)
  const persistentEnvLocal = stripManagedConvexEnvVars({
    ...preservedEnvLocal,
    ...convexVars,
  })
  if (Object.keys(persistentEnvLocal).length > 0) {
    writeFileSyncFn(envLocalPath, `${serializeEnvFile(persistentEnvLocal)}\n`, 'utf8')
  }

  if (shouldResetLocalBackendForMissingSecret(exampleEnv, preservedEnvLocal)) {
    const sqlitePath = convexLocalSqlitePath(cwd)
    if (existsSyncFn(sqlitePath)) {
      rmSyncFn(sqlitePath)
    }
  }

  const convexEnv = {
    ...process.env,
    CONVEX_AGENT_MODE: 'anonymous',
    CONVEX_LOCAL_BACKEND_PORT: String(port),
  }

  if (disableAiFiles) {
    await runCheckedCommand({
      label: 'convex',
      spawnFn,
      cwd,
      env: convexEnv,
      command: 'pnpm',
      args: ['exec', 'convex', 'ai-files', 'disable'],
      stdout,
      stderr,
    })
  }

  const convex = spawnFn(
    'pnpm',
    [
      'exec',
      'convex',
      'dev',
      '--local',
      '--local-cloud-port',
      String(port),
      '--local-site-port',
      String(port + 1),
    ],
    {
      cwd,
      env: convexEnv,
      stdio: ['inherit', 'pipe', 'pipe'],
    },
  )

  const flushConvexStdout = prefixStream(convex.stdout, 'convex', '36', stdout)
  const flushConvexStderr = prefixStream(convex.stderr, 'convex', '36', stderr)

  // Initialize as no-ops so shutdown() can call them safely before nuxt is spawned.
  let flushNuxtStdout = () => {}
  let flushNuxtStderr = () => {}
  let nuxt = null
  let shuttingDown = false
  let finishRun
  const finished = new Promise((resolve) => {
    finishRun = resolve
  })

  const shutdown = async (exitCode = 0) => {
    if (shuttingDown) return
    shuttingDown = true
    cleanupSignalHandlers()

    await stopChild(nuxt)
    await stopChild(convex)
    flushNuxtStdout()
    flushNuxtStderr()
    flushConvexStdout()
    flushConvexStderr()
    finishRun()
    exitFn(exitCode)
  }

  const handleSigint = createSignalHandler({ signalName: 'SIGINT', stderr, shutdown })
  const handleSigterm = createSignalHandler({ signalName: 'SIGTERM', stderr, shutdown })

  process.once('SIGINT', handleSigint)
  process.once('SIGTERM', handleSigterm)

  const cleanupSignalHandlers = () => {
    process.removeListener('SIGINT', handleSigint)
    process.removeListener('SIGTERM', handleSigterm)
  }

  // Attach exit listener immediately to avoid missing exits that happen before the race starts.
  const convexExit = onceExit(convex).then(({ code, signal }) => {
    if (shuttingDown) return
    throw createProcessExitError('Convex', code, signal)
  })

  try {
    const ready = await Promise.race([
      (async () => {
        // expectedUrl guards against residual .env.local writes from a concurrent prior run.
        const env = await waitForConvexEnvFn(cwd, { expectedUrl: `:${port}` })
        await waitForConvexReadyFn(cwd, port)
        return env
      })(),
      convexExit,
    ])

    // Push .env.example vars to the Convex deployment, generating secrets for placeholders.
    if (Object.keys(convexVars).length > 0) {
      const sysLabel = colorize('system'.padEnd(6), '33')
      stdout.write(`${sysLabel} configuring Convex env vars from .env.example\n`)
      await pushConvexEnvVars({ vars: convexVars, cwd, spawnFn, env: convexEnv, stdout, stderr })
    }

    nuxt = spawnFn('pnpm', ['run', 'dev:nuxt'], {
      cwd,
      env: {
        ...process.env,
        ...persistentEnvLocal,
        ...ready,
        PORT: String(desiredNuxtPort),
      },
      stdio: ['inherit', 'pipe', 'pipe'],
    })

    flushNuxtStdout = prefixStream(nuxt.stdout, 'nuxt', '35', stdout)
    flushNuxtStderr = prefixStream(nuxt.stderr, 'nuxt', '35', stderr)

    const nuxtExit = onceExit(nuxt).then(({ code, signal }) => {
      if (shuttingDown) return
      throw createProcessExitError('Nuxt', code, signal)
    })

    await Promise.race([convexExit, nuxtExit, finished])
    if (shuttingDown) return

    await shutdown(1)
  } catch (error) {
    const label = colorize('system'.padEnd(6), '31')
    stderr.write(`${label} ${error instanceof Error ? error.message : String(error)}\n`)
    await shutdown(1)
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  void runExampleDev()
}
