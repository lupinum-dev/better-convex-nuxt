import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { readFile, stat } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  assertNoJwtShapedValue,
  normalizeEvidenceOrigin,
  redactEvidenceLog,
} from './mcp-auth-contracts.mjs'
import { startLocalMcpOAuthFixture } from './mcp-local-fixture.mjs'

const convexCli = fileURLToPath(new URL('../node_modules/convex/bin/main.js', import.meta.url))
const MAX_ENV_FILE_BYTES = 128 * 1024
const MAX_CONVEX_OUTPUT_BYTES = 256 * 1024

const externalVariableNames = Object.freeze([
  'BCN_MCP_TEST_APP_DIR',
  'BCN_MCP_TEST_CONVEX_SITE_URL',
  'BCN_MCP_TEST_CONVEX_URL',
  'BCN_MCP_TEST_EMAIL',
  'BCN_MCP_TEST_ORIGIN',
  'BCN_MCP_TEST_PASSWORD',
])

const childCredentialVariableNames = Object.freeze([
  'BCN_AUTH_PROXY_IP_SECRET',
  'BCN_MCP_CONFORMANCE_BEARER',
  'BCN_MCP_TEST_MODE',
  ...externalVariableNames,
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_SECRETS',
  'CONVEX_DEPLOY_KEY',
  'CONVEX_DEPLOYMENT',
  'CONVEX_SELF_HOSTED_ADMIN_KEY',
  'CONVEX_SELF_HOSTED_URL',
  'CONVEX_SITE_URL',
  'CONVEX_URL',
  'MCP_SERVER_SECRET',
  'NUXT_PUBLIC_CONVEX_SITE_URL',
  'NUXT_PUBLIC_CONVEX_URL',
])

function requiredEnvironmentValue(environment, name) {
  const value = environment[name]
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} is required in external-disposable MCP test mode`)
  }
  return value
}

function exactOrigin(environment, name) {
  const value = requiredEnvironmentValue(environment, name)
  const normalized = normalizeEvidenceOrigin(value)
  if (normalized !== value) {
    throw new Error(`${name} must be one exact canonical origin without a trailing slash`)
  }
  return normalized
}

function parseExternalConfiguration(environment) {
  const appDir = requiredEnvironmentValue(environment, 'BCN_MCP_TEST_APP_DIR')
  if (!isAbsolute(appDir)) {
    throw new Error('BCN_MCP_TEST_APP_DIR must be an absolute path')
  }

  const origin = exactOrigin(environment, 'BCN_MCP_TEST_ORIGIN')
  const convexUrl = exactOrigin(environment, 'BCN_MCP_TEST_CONVEX_URL')
  const convexSiteUrl = exactOrigin(environment, 'BCN_MCP_TEST_CONVEX_SITE_URL')
  if (new Set([origin, convexUrl, convexSiteUrl]).size !== 3) {
    throw new Error('The MCP app, Convex API, and Convex site origins must be distinct')
  }

  const email = requiredEnvironmentValue(environment, 'BCN_MCP_TEST_EMAIL')
  if (email !== email.trim() || email.length > 320 || !/^[^\s@]+@[^\s@]+$/u.test(email)) {
    throw new Error('BCN_MCP_TEST_EMAIL must be one bounded email address')
  }

  const password = requiredEnvironmentValue(environment, 'BCN_MCP_TEST_PASSWORD')
  if (password.length < 15 || password.length > 1_024 || /[\0\r\n]/u.test(password)) {
    throw new Error(
      'BCN_MCP_TEST_PASSWORD must be a single-line password between 15 and 1,024 characters',
    )
  }

  return Object.freeze({
    appDir,
    convexSiteUrl,
    convexUrl,
    email,
    mode: 'external-disposable',
    origin,
    password,
  })
}

export function parseMcpEvidenceFixtureConfiguration(environment = process.env) {
  const mode = environment.BCN_MCP_TEST_MODE ?? 'local'
  if (mode === 'external-disposable') return parseExternalConfiguration(environment)
  if (mode !== 'local') {
    throw new Error('Unknown BCN_MCP_TEST_MODE; expected local or external-disposable')
  }
  const unexpected = externalVariableNames.filter((name) => environment[name] !== undefined)
  if (unexpected.length > 0) {
    throw new Error(
      `External MCP fixture values require BCN_MCP_TEST_MODE=external-disposable: ${unexpected.join(', ')}`,
    )
  }
  return Object.freeze({ mode: 'local' })
}

export function safeMcpFixtureChildEnvironment(environment = process.env) {
  const childEnvironment = { ...environment }
  for (const name of childCredentialVariableNames) delete childEnvironment[name]
  return childEnvironment
}

function readTopologyEnvironment(source) {
  const topology = {}
  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator === -1) continue
    const name = line.slice(0, separator).trim()
    if (
      ![
        'CONVEX_SITE_URL',
        'CONVEX_URL',
        'NUXT_PUBLIC_CONVEX_SITE_URL',
        'NUXT_PUBLIC_CONVEX_URL',
        'SITE_URL',
      ].includes(name)
    ) {
      continue
    }
    if (Object.hasOwn(topology, name)) {
      throw new Error(`External MCP app .env.local contains duplicate ${name} values`)
    }
    let value = line.slice(separator + 1).trim()
    if (
      value.length >= 2 &&
      ((value.startsWith("'") && value.endsWith("'")) ||
        (value.startsWith('"') && value.endsWith('"')))
    ) {
      value = value.slice(1, -1)
    }
    topology[name] = value
  }
  return topology
}

async function validateExternalApp(configuration) {
  const directory = await stat(configuration.appDir).catch(() => undefined)
  if (!directory?.isDirectory()) {
    throw new Error('BCN_MCP_TEST_APP_DIR must reference an existing directory')
  }
  const envFile = join(configuration.appDir, '.env.local')
  const metadata = await stat(envFile).catch(() => undefined)
  if (!metadata?.isFile() || metadata.size > MAX_ENV_FILE_BYTES) {
    throw new Error('The external MCP app must have one bounded .env.local file')
  }
  const topology = readTopologyEnvironment(await readFile(envFile, 'utf8'))
  if (
    topology.SITE_URL !== configuration.origin ||
    topology.CONVEX_URL !== configuration.convexUrl ||
    topology.CONVEX_SITE_URL !== configuration.convexSiteUrl ||
    topology.NUXT_PUBLIC_CONVEX_URL !== configuration.convexUrl ||
    topology.NUXT_PUBLIC_CONVEX_SITE_URL !== configuration.convexSiteUrl
  ) {
    throw new Error(
      'The external MCP origins must exactly match SITE_URL, CONVEX_URL, CONVEX_SITE_URL, NUXT_PUBLIC_CONVEX_URL, and NUXT_PUBLIC_CONVEX_SITE_URL in .env.local',
    )
  }
}

function capture(child) {
  let output = ''
  const append = (chunk) => {
    output = (output + chunk.toString()).slice(-MAX_CONVEX_OUTPUT_BYTES)
  }
  child.stdout?.on('data', append)
  child.stderr?.on('data', append)
  return () => output.trim()
}

function safeConvexLog(value, configuration) {
  assertNoJwtShapedValue(value)
  return redactEvidenceLog(value, [configuration.email, configuration.password])
}

function createExternalRunConvex(configuration, environment) {
  return async (functionName, args = {}) => {
    if (!/^[\w./-]+:\w+$/u.test(functionName)) {
      throw new Error('Invalid fixture Convex function name')
    }
    const child = spawn(
      process.execPath,
      [convexCli, 'run', functionName, JSON.stringify(args), '--env-file', '.env.local'],
      {
        cwd: configuration.appDir,
        env: safeMcpFixtureChildEnvironment(environment),
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    const output = capture(child)
    let result
    try {
      result = await once(child, 'close')
    } catch {
      throw new Error('The repository-pinned Convex CLI could not be started')
    }
    const [code, signal] = result
    if (code !== 0) {
      throw new Error(
        `External fixture Convex command failed (${code ?? signal ?? 'unknown'}): ${safeConvexLog(output(), configuration)}`,
      )
    }
    const value = output()
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }
}

async function startExternalMcpOAuthFixture(configuration, environment) {
  await validateExternalApp(configuration)
  return Object.freeze({
    convexSiteUrl: configuration.convexSiteUrl,
    convexUrl: configuration.convexUrl,
    cwd: configuration.appDir,
    email: configuration.email,
    origin: configuration.origin,
    password: configuration.password,
    release: async () => {},
    runConvex: createExternalRunConvex(configuration, environment),
  })
}

export async function startMcpEvidenceFixture(environment = process.env) {
  const configuration = parseMcpEvidenceFixtureConfiguration(environment)
  if (configuration.mode === 'local') return startLocalMcpOAuthFixture()
  return startExternalMcpOAuthFixture(configuration, environment)
}
