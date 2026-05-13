#!/usr/bin/env node

import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import net from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { parse as parseDotenv } from 'dotenv'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..')

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT_START = 3210
const DEFAULT_PORT_END = 3298
const READINESS_TIMEOUT_MS = 25_000
const SHUTDOWN_GRACE_MS = 3_000
const LOCAL_JWKS_BOOTSTRAP_SENTINEL = '__TRELLIS_LOCAL_JWKS_BOOTSTRAP__'
const EXAMPLE_DEFAULTS_FILE_NAME = '.env.example'
const LOCAL_ENV_FILE_NAME = '.env.local'
const LOCAL_ENV_FILE_HEADER = [
  '# Shared local environment for this example.',
  '# Convex reads .env.local directly, so the launcher keeps local runtime values here.',
  '# App-owned values are preserved. Launcher-owned local runtime values are rewritten on each run.',
].join('\n')

const LOCAL_RUNTIME_ENV_KEYS = new Set([
  'CONVEX_DEPLOYMENT',
  'CONVEX_LOCAL_BACKEND_PORT',
  'CONVEX_URL',
  'CONVEX_SITE_URL',
  'JWKS',
  'NUXT_PUBLIC_CONVEX_URL',
  'NUXT_PUBLIC_CONVEX_SITE_URL',
  'SITE_URL',
])
const SOURCE_FINGERPRINT_VERSION = 'v1'
const SOURCE_FINGERPRINT_EXTENSIONS = new Set([
  '.cjs',
  '.cts',
  '.js',
  '.json',
  '.jsx',
  '.mjs',
  '.mts',
  '.ts',
  '.tsx',
  '.vue',
])

function colorize(text, code) {
  if (process.env.NO_COLOR) return text
  return `\u001B[${code}m${text}\u001B[0m`
}

export function buildLocalRuntimeEnv({
  port,
  siteUrl = `http://${DEFAULT_HOST}:${getDesiredNuxtPort()}`,
  baseEnv = {},
}) {
  const convexUrl = `http://${DEFAULT_HOST}:${port}`
  const convexSiteUrl = `http://${DEFAULT_HOST}:${port + 1}`

  return {
    ...baseEnv,
    CONVEX_LOCAL_BACKEND_PORT: String(port),
    CONVEX_URL: convexUrl,
    NUXT_PUBLIC_CONVEX_URL: convexUrl,
    CONVEX_SITE_URL: convexSiteUrl,
    NUXT_PUBLIC_CONVEX_SITE_URL: convexSiteUrl,
    SITE_URL: siteUrl,
  }
}

export function readDotenvFile(
  cwd,
  fileName,
  { existsSyncFn = existsSync, readFileSyncFn = readFileSync } = {},
) {
  const filePath = path.join(cwd, fileName)
  if (!existsSyncFn(filePath)) return {}

  return parseDotenv(readFileSyncFn(filePath, 'utf8'))
}

export function readLocalEnvFile(cwd, options = {}) {
  return readDotenvFile(cwd, LOCAL_ENV_FILE_NAME, options)
}

export function readExampleDefaultsFile(cwd, options = {}) {
  return readDotenvFile(cwd, EXAMPLE_DEFAULTS_FILE_NAME, options)
}

function serializeEnvValue(value) {
  if (value === '') return '""'
  if (/^[\w./:@-]+$/.test(value)) return value
  return JSON.stringify(value)
}

export function serializeEnvFileContents(values) {
  return Object.entries(values)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${serializeEnvValue(value)}`)
    .join('\n')
}

export function writeLocalEnvFile(cwd, values, { writeFileSyncFn = writeFileSync } = {}) {
  const filePath = path.join(cwd, LOCAL_ENV_FILE_NAME)
  const serializedValues = serializeEnvFileContents(values)
  const fileContents = serializedValues
    ? `${LOCAL_ENV_FILE_HEADER}\n\n${serializedValues}\n`
    : `${LOCAL_ENV_FILE_HEADER}\n`

  writeFileSyncFn(filePath, fileContents, 'utf8')
}

export function stripLocalRuntimeEnvKeys(values) {
  return Object.fromEntries(
    Object.entries(values).filter(([key]) => !LOCAL_RUNTIME_ENV_KEYS.has(key)),
  )
}

export function resolveGeneratedSecretEnvValues(exampleDefaults, storedEnv = {}) {
  const generatedSecretValues = {}

  for (const [key, value] of Object.entries(exampleDefaults)) {
    if (!/replace.?me/i.test(value)) continue

    const storedValue = storedEnv[key]
    if (storedValue && !/replace.?me/i.test(storedValue)) {
      generatedSecretValues[key] = storedValue
      continue
    }

    generatedSecretValues[key] = randomBytes(32).toString('hex')
  }

  return generatedSecretValues
}

export function shouldResetLocalBackendForMissingGeneratedSecret(exampleDefaults, localEnv) {
  return (
    /replace.?me/i.test(exampleDefaults.BETTER_AUTH_SECRET ?? '') && !localEnv.BETTER_AUTH_SECRET
  )
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
  return `http://${DEFAULT_HOST}:${getDesiredNuxtPort(cwd)}`
}

function collectExampleSourceFiles(
  rootDir,
  { existsSyncFn = existsSync, readdirSyncFn = readdirSync } = {},
) {
  if (!existsSyncFn(rootDir)) return []

  const entries = readdirSyncFn(rootDir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const absolutePath = path.join(rootDir, entry.name)

    if (entry.isDirectory()) {
      if (entry.name === '_generated' || entry.name === 'node_modules') continue
      files.push(...collectExampleSourceFiles(absolutePath, { existsSyncFn, readdirSyncFn }))
      continue
    }

    if (!entry.isFile()) continue
    if (!SOURCE_FINGERPRINT_EXTENSIONS.has(path.extname(entry.name))) continue
    files.push(absolutePath)
  }

  return files.sort()
}

export function buildExampleSourceFingerprint(
  cwd,
  { existsSyncFn = existsSync, readdirSyncFn = readdirSync, readFileSyncFn = readFileSync } = {},
) {
  const hash = createHash('sha256')
  hash.update(SOURCE_FINGERPRINT_VERSION)

  for (const relativeRoot of ['convex', 'shared']) {
    const absoluteRoot = path.join(cwd, relativeRoot)
    for (const absolutePath of collectExampleSourceFiles(absoluteRoot, {
      existsSyncFn,
      readdirSyncFn,
    })) {
      hash.update(path.relative(cwd, absolutePath))
      hash.update('\0')
      hash.update(readFileSyncFn(absolutePath))
      hash.update('\0')
    }
  }

  return hash.digest('hex')
}

export function shouldResetLocalBackendForSourceFingerprint(currentFingerprint, storedFingerprint) {
  return typeof storedFingerprint !== 'string' || storedFingerprint !== currentFingerprint
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

export async function selectLocalPortPair({
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
    exampleSourceFingerprint,
    readConvexLocalConfigFn = readConvexLocalConfig,
    writeConvexLocalConfigFn = writeConvexLocalConfig,
  } = {},
) {
  const config = readConvexLocalConfigFn(cwd)
  if (!config) return

  const hasMatchingPorts = config.ports?.cloud === port && config.ports?.site === port + 1
  const hasMatchingFingerprint =
    typeof exampleSourceFingerprint !== 'string' ||
    config.exampleSourceFingerprint === exampleSourceFingerprint

  if (hasMatchingPorts && hasMatchingFingerprint) return

  writeConvexLocalConfigFn(cwd, {
    ...config,
    ...(typeof exampleSourceFingerprint === 'string' ? { exampleSourceFingerprint } : {}),
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

function shouldBootstrapStaticJwks(cwd) {
  return existsSync(path.join(cwd, 'convex', 'auth.config.ts'))
}

export function readStaticJwksFromLocalBackend(
  cwd,
  { spawnSyncFn = spawnSync, sqlitePath = convexLocalSqlitePath(cwd) } = {},
) {
  const result = spawnSyncFn(
    'sqlite3',
    [
      '-json',
      sqlitePath,
      [
        'select json_value',
        'from documents',
        'where deleted = 0',
        "and json_extract(json_value, '$.publicKey') is not null",
        "and json_extract(json_value, '$.privateKey') is not null",
        'order by ts desc;',
      ].join(' '),
    ],
    {
      encoding: 'utf8',
      stdio: 'pipe',
    },
  )

  if (result.status !== 0) return null

  try {
    const rows = JSON.parse(result.stdout || '[]')
    if (!Array.isArray(rows) || rows.length === 0) return null

    const jwks = rows.flatMap((row) => {
      if (!row || typeof row !== 'object' || typeof row.json_value !== 'string') {
        return []
      }

      try {
        const doc = JSON.parse(row.json_value)
        if (
          !doc ||
          typeof doc !== 'object' ||
          typeof doc._id !== 'string' ||
          typeof doc.publicKey !== 'string' ||
          typeof doc.privateKey !== 'string'
        ) {
          return []
        }

        return [
          {
            id: doc._id,
            publicKey: doc.publicKey,
            privateKey: doc.privateKey,
            createdAt:
              typeof doc.createdAt === 'number'
                ? doc.createdAt
                : typeof doc._creationTime === 'number'
                  ? doc._creationTime
                  : Date.now(),
            ...(typeof doc.expiresAt === 'number' ? { expiresAt: doc.expiresAt } : {}),
            ...(typeof doc.alg === 'string' ? { alg: doc.alg } : {}),
            ...(typeof doc.crv === 'string' ? { crv: doc.crv } : {}),
          },
        ]
      } catch {
        return []
      }
    })

    return jwks.length > 0 ? JSON.stringify(jwks) : null
  } catch {
    return null
  }
}

export async function materializeLocalStaticJwks(siteUrl, { fetchFn = globalThis.fetch } = {}) {
  if (typeof siteUrl !== 'string' || siteUrl.length === 0) return
  if (typeof fetchFn !== 'function') return

  try {
    await fetchFn(new URL('/api/auth/convex/jwks', siteUrl), {
      method: 'GET',
      headers: {
        accept: 'application/json',
      },
    })
  } catch {
    // Ignore local site readiness races while the backend starts.
  }
}

export async function waitForLocalStaticJwks(
  cwd,
  {
    timeoutMs = READINESS_TIMEOUT_MS,
    intervalMs = 100,
    siteUrl,
    readStaticJwksFromLocalBackendFn = readStaticJwksFromLocalBackend,
    materializeLocalStaticJwksFn = materializeLocalStaticJwks,
  } = {},
) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const jwks = readStaticJwksFromLocalBackendFn(cwd)
    if (jwks) return jwks

    await materializeLocalStaticJwksFn(siteUrl)

    const materializedJwks = readStaticJwksFromLocalBackendFn(cwd)
    if (materializedJwks) return materializedJwks

    await sleep(intervalMs)
  }

  throw new Error(`Timed out waiting for Better Auth JWKS in ${convexLocalSqlitePath(cwd)}.`)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function workspacePnpmArgs(cwd, args) {
  return ['--dir', cwd, ...args]
}

function ensureLocalWorkspacePackageLink(cwd) {
  const scopeDir = path.join(cwd, 'node_modules', '@lupinum')
  const packageLink = path.join(scopeDir, 'trellis')
  const desiredTarget = path.resolve(scopeDir, path.relative(scopeDir, REPO_ROOT))

  mkdirSync(scopeDir, { recursive: true })

  try {
    const existing = lstatSync(packageLink)
    if (existing.isSymbolicLink()) {
      const currentTarget = path.resolve(scopeDir, readlinkSync(packageLink))
      if (currentTarget === desiredTarget) return
    }
    rmSync(packageLink, { recursive: true, force: true })
  } catch {
    // Nothing to replace.
  }

  symlinkSync(path.relative(scopeDir, desiredTarget), packageLink, 'dir')
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
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'trellis-convex-env-'))
  const tmpPath = path.join(tmpDir, 'env')
  writeFileSync(tmpPath, `${serializeEnvFileContents(vars)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  })

  try {
    await runCheckedCommand({
      label: 'convex',
      spawnFn,
      cwd: REPO_ROOT,
      env,
      command: 'pnpm',
      args: workspacePnpmArgs(cwd, [
        'exec',
        'convex',
        'env',
        'set',
        '--force',
        '--from-file',
        tmpPath,
      ]),
      stdout,
      stderr,
    })
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      // Ignore temp-file cleanup races.
    }
  }
}

function areConvexAiFilesDisabled(cwd, env = process.env) {
  try {
    const result = spawnSync(
      'pnpm',
      workspacePnpmArgs(cwd, ['exec', 'convex', 'ai-files', 'status']),
      {
        cwd: REPO_ROOT,
        env,
        encoding: 'utf8',
        stdio: 'pipe',
      },
    )
    if (result.status !== 0) {
      return false
    }
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
    return output.includes('Convex AI files: disabled')
  } catch {
    return false
  }
}

async function prepareLocalModuleForDev({ spawnFn, stdout, stderr }) {
  const systemLabel = colorize('system'.padEnd(6), '33')
  stdout.write(`${systemLabel} preparing local @lupinum/trellis module\n`)

  await runCheckedCommand({
    label: 'build',
    spawnFn,
    cwd: REPO_ROOT,
    env: process.env,
    command: 'pnpm',
    args: ['run', 'build:module'],
    stdout,
    stderr,
  })
}

export function createExampleLocalEnv({
  cwd,
  port,
  readExampleDefaultsFileFn = readExampleDefaultsFile,
  readLocalEnvFileFn = readLocalEnvFile,
}) {
  const exampleDefaults = {
    ...readExampleDefaultsFileFn(cwd),
    SITE_URL: getDesiredSiteUrl(cwd),
  }
  const existingLocalEnv = readLocalEnvFileFn(cwd)
  const appOwnedLocalEnv = stripLocalRuntimeEnvKeys(existingLocalEnv)
  const existingConvexDeployment =
    typeof existingLocalEnv.CONVEX_DEPLOYMENT === 'string'
      ? { CONVEX_DEPLOYMENT: existingLocalEnv.CONVEX_DEPLOYMENT }
      : {}
  const generatedSecretEnv = resolveGeneratedSecretEnvValues(exampleDefaults, existingLocalEnv)
  const localRuntimeEnv = buildLocalRuntimeEnv({
    port,
    siteUrl: exampleDefaults.SITE_URL,
  })

  return {
    exampleDefaults,
    existingLocalEnv,
    appOwnedLocalEnv,
    generatedSecretEnv,
    localRuntimeEnv,
    bootstrapLocalEnvFileValues: {
      ...appOwnedLocalEnv,
      ...existingConvexDeployment,
      ...generatedSecretEnv,
    },
    localEnvFileValues: {
      ...appOwnedLocalEnv,
      ...generatedSecretEnv,
      ...localRuntimeEnv,
    },
    deploymentEnvVars: {
      ...stripLocalRuntimeEnvKeys({
        ...exampleDefaults,
        ...generatedSecretEnv,
        ...existingLocalEnv,
      }),
      SITE_URL: exampleDefaults.SITE_URL,
    },
  }
}

export async function runExampleDev({
  cwd = process.cwd(),
  spawnFn = spawn,
  findAvailablePortPairFn = findAvailablePortPair,
  isPortFreeFn = isPortFree,
  waitForConvexReadyFn = waitForConvexReady,
  // eslint-disable-next-line no-unused-vars
  waitForLocalStaticJwksFn = waitForLocalStaticJwks,
  existsSyncFn = existsSync,
  rmSyncFn = rmSync,
  readExampleDefaultsFileFn = readExampleDefaultsFile,
  readLocalEnvFileFn = readLocalEnvFile,
  writeLocalEnvFileFn = writeLocalEnvFile,
  readConvexLocalConfigFn = readConvexLocalConfig,
  writeConvexLocalConfigFn = writeConvexLocalConfig,
  ensureLocalWorkspacePackageLinkFn = ensureLocalWorkspacePackageLink,
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

  ensureLocalWorkspacePackageLinkFn(cwd)

  const exampleSourceFingerprint = buildExampleSourceFingerprint(cwd)
  const desiredNuxtPort = getDesiredNuxtPort(cwd)
  const storedConvexLocalConfig = readConvexLocalConfigFn(cwd)
  const configuredPorts = storedConvexLocalConfig?.ports
  await clearPortsFn([desiredNuxtPort, configuredPorts?.cloud, configuredPorts?.site], { stdout })

  const port = await selectLocalPortPair({
    cwd,
    findAvailablePortPairFn,
    isPortFreeFn,
    readConvexLocalConfigFn,
  })

  await clearPortsFn([port, port + 1], { stdout })

  syncConvexLocalConfigPortPair(cwd, port, {
    exampleSourceFingerprint,
    readConvexLocalConfigFn,
    writeConvexLocalConfigFn,
  })

  const exampleLocalEnv = createExampleLocalEnv({
    cwd,
    port,
    readExampleDefaultsFileFn,
    readLocalEnvFileFn,
  })
  const shouldBootstrapJwks = shouldBootstrapStaticJwks(cwd)
  const bootstrapJwksEnv = shouldBootstrapJwks
    ? {
        JWKS:
          typeof exampleLocalEnv.existingLocalEnv.JWKS === 'string'
            ? exampleLocalEnv.existingLocalEnv.JWKS
            : LOCAL_JWKS_BOOTSTRAP_SENTINEL,
      }
    : {}

  writeLocalEnvFileFn(cwd, {
    ...exampleLocalEnv.bootstrapLocalEnvFileValues,
    ...bootstrapJwksEnv,
  })

  if (
    shouldResetLocalBackendForSourceFingerprint(
      exampleSourceFingerprint,
      storedConvexLocalConfig?.exampleSourceFingerprint,
    ) ||
    shouldResetLocalBackendForMissingGeneratedSecret(
      exampleLocalEnv.exampleDefaults,
      exampleLocalEnv.existingLocalEnv,
    )
  ) {
    const sqlitePath = convexLocalSqlitePath(cwd)
    if (existsSyncFn(sqlitePath)) {
      rmSyncFn(sqlitePath)
    }
  }

  const bootstrapDeploymentEnvVars = shouldBootstrapJwks
    ? {
        ...exampleLocalEnv.deploymentEnvVars,
        ...bootstrapJwksEnv,
      }
    : exampleLocalEnv.deploymentEnvVars

  const convexEnv = {
    ...process.env,
    ...bootstrapDeploymentEnvVars,
    CONVEX_AGENT_MODE: 'anonymous',
    CONVEX_LOCAL_BACKEND_PORT: String(port),
    NODE_ENV: process.env.NODE_ENV || 'development',
  }

  const convex = spawnFn(
    'pnpm',
    workspacePnpmArgs(cwd, [
      'exec',
      'convex',
      'dev',
      '--local',
      '--local-cloud-port',
      String(port),
      '--local-site-port',
      String(port + 1),
    ]),
    {
      cwd: REPO_ROOT,
      env: convexEnv,
      stdio: ['inherit', 'pipe', 'pipe'],
    },
  )

  const flushConvexStdout = prefixStream(convex.stdout, 'convex', '36', stdout)
  const flushConvexStderr = prefixStream(convex.stderr, 'convex', '36', stderr)

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

  const convexExit = onceExit(convex).then(({ code, signal }) => {
    if (shuttingDown) return
    throw createProcessExitError('Convex', code, signal)
  })

  try {
    await Promise.race([waitForConvexReadyFn(cwd, port), convexExit])

    const convexManagedLocalEnv = readLocalEnvFileFn(cwd)
    const convexDeployment =
      typeof convexManagedLocalEnv.CONVEX_DEPLOYMENT === 'string'
        ? { CONVEX_DEPLOYMENT: convexManagedLocalEnv.CONVEX_DEPLOYMENT }
        : {}

    writeLocalEnvFileFn(cwd, {
      ...exampleLocalEnv.localEnvFileValues,
      ...convexDeployment,
      ...bootstrapJwksEnv,
    })

    const postReadyConvexEnv = {
      ...convexEnv,
      ...convexDeployment,
    }

    if (Object.keys(bootstrapDeploymentEnvVars).length > 0) {
      const systemLabel = colorize('system'.padEnd(6), '33')
      stdout.write(
        `${systemLabel} configuring Convex env vars from example defaults and .env.local\n`,
      )

      await pushConvexEnvVars({
        vars: bootstrapDeploymentEnvVars,
        cwd,
        spawnFn,
        env: postReadyConvexEnv,
        stdout,
        stderr,
      })
    }

    if (disableAiFiles && !areConvexAiFilesDisabled(cwd, postReadyConvexEnv)) {
      await runCheckedCommand({
        label: 'convex',
        spawnFn,
        cwd: REPO_ROOT,
        env: postReadyConvexEnv,
        command: 'pnpm',
        args: workspacePnpmArgs(cwd, ['exec', 'convex', 'ai-files', 'disable']),
        stdout,
        stderr,
      })
    }

    const mergedRuntimeEnv = {
      ...exampleLocalEnv.exampleDefaults,
      ...exampleLocalEnv.appOwnedLocalEnv,
      ...exampleLocalEnv.generatedSecretEnv,
      ...exampleLocalEnv.localRuntimeEnv,
      HOST: DEFAULT_HOST,
      PORT: String(desiredNuxtPort),
    }

    nuxt = spawnFn('pnpm', workspacePnpmArgs(cwd, ['run', 'dev:nuxt']), {
      cwd,
      env: {
        ...process.env,
        ...mergedRuntimeEnv,
        NUXT_HOST: DEFAULT_HOST,
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
