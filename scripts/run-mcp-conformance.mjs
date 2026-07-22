#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { readFile, readdir, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { basename, dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'

import { normalizeEvidenceOrigin } from './mcp-auth-contracts.mjs'

export { normalizeEvidenceOrigin } from './mcp-auth-contracts.mjs'

export const MCP_CONFORMANCE_HOST = '127.0.0.1'
export const MCP_CONFORMANCE_PORT = 7334
export const MCP_CONFORMANCE_SPEC_VERSION = '2025-11-25'
export const MCP_CONFORMANCE_OUTPUT = '.artifacts/mcp-conformance/server-2025-11-25'
export const MCP_CONFORMANCE_URL = `http://${MCP_CONFORMANCE_HOST}:${MCP_CONFORMANCE_PORT}/mcp`
export const MCP_CONFORMANCE_ORIGIN = `http://${MCP_CONFORMANCE_HOST}:${MCP_CONFORMANCE_PORT}`
export const MCP_CONFORMANCE_SCENARIOS = Object.freeze(['server-initialize', 'ping', 'tools-list'])
export const MCP_RC_PROTOCOL_VERSION = '2026-07-28'
export const MCP_RC_EXPECTED_CAPABILITIES = Object.freeze(['tools'])

const MAX_RELAY_BODY_BYTES = 64 * 1024
const RELAY_TIMEOUT_MS = 30_000
const SUITE_TIMEOUT_MS = 900_000
const MAX_RC_RESPONSE_BYTES = 256 * 1024
const REQUEST_HEADERS = [
  'accept',
  'content-type',
  'last-event-id',
  'mcp-method',
  'mcp-name',
  'mcp-protocol-version',
  'mcp-session-id',
]
const RESPONSE_HEADERS = [
  'allow',
  'cache-control',
  'content-type',
  'last-event-id',
  'mcp-protocol-version',
  'mcp-session-id',
  'retry-after',
  'vary',
  'www-authenticate',
]

export function buildConformanceArgs(scenario) {
  if (!MCP_CONFORMANCE_SCENARIOS.includes(scenario)) {
    throw new Error('Unknown BCN MCP conformance scenario')
  }
  return [
    'exec',
    'conformance',
    'server',
    '--url',
    MCP_CONFORMANCE_URL,
    '--scenario',
    scenario,
    '--spec-version',
    MCP_CONFORMANCE_SPEC_VERSION,
    '--output-dir',
    MCP_CONFORMANCE_OUTPUT,
  ]
}

function copyAllowedHeaders(input, names) {
  const output = new Headers()
  for (const name of names) {
    const value = input.get(name)
    if (value !== null) output.set(name, value)
  }
  return output
}

export function buildRelayRequestHeaders(input, bearer) {
  if (typeof bearer !== 'string' || !bearer || bearer.length > 16_384) {
    throw new Error('BCN_MCP_CONFORMANCE_BEARER is invalid')
  }
  const hasUnsafeCharacter = [...bearer].some((character) => {
    const code = character.codePointAt(0)
    return code === undefined || code <= 31 || code === 127 || /\s/.test(character)
  })
  if (hasUnsafeCharacter) {
    throw new Error('BCN_MCP_CONFORMANCE_BEARER is invalid')
  }
  const output = copyAllowedHeaders(input, REQUEST_HEADERS)
  output.set('authorization', `Bearer ${bearer}`)
  return output
}

export function buildRelayResponseHeaders(input) {
  return copyAllowedHeaders(input, RESPONSE_HEADERS)
}

export function isRedirectResponse(status) {
  return status >= 300 && status < 400
}

async function readRcResponse(response) {
  const text = await response.text()
  if (Buffer.byteLength(text) > MAX_RC_RESPONSE_BYTES) {
    throw new Error('MCP RC conformance response exceeded its bound')
  }
  try {
    return text ? JSON.parse(text) : null
  } catch {
    throw new Error(`MCP RC conformance response was not JSON (${response.status})`)
  }
}

function requireRcError(evidence, status, code, description) {
  if (
    evidence.status !== status ||
    evidence.body?.error?.code !== code ||
    evidence.body?.result !== undefined
  ) {
    throw new Error(`MCP RC ${description} did not fail with ${status}/${code}`)
  }
}

function requireRcResultMetadata(result, description) {
  const serverInfo = result?._meta?.['io.modelcontextprotocol/serverInfo']
  if (
    result?.resultType !== 'complete' ||
    !serverInfo ||
    typeof serverInfo.name !== 'string' ||
    typeof serverInfo.version !== 'string'
  ) {
    throw new Error(`MCP RC ${description} omitted complete server identity metadata`)
  }
}

export async function runRcProtocolConformance({ bearer, endpoint, fetch = globalThis.fetch }) {
  if (typeof bearer !== 'string' || !bearer || bearer.length > 16_384) {
    throw new Error('MCP RC conformance bearer is invalid')
  }
  const resource = new URL(endpoint)
  if (resource.pathname !== '/mcp' || resource.search || resource.hash) {
    throw new Error('MCP RC conformance endpoint is invalid')
  }
  const exchanges = []
  const observedFetch = async (input, init) => {
    const request = new Request(input, init)
    const requestBody = JSON.parse(await request.clone().text())
    const response = await fetch(request)
    const responseBody = await readRcResponse(response.clone())
    exchanges.push({
      requestBody,
      requestHeaders: new Headers(request.headers),
      responseBody,
      responseHeaders: new Headers(response.headers),
      status: response.status,
    })
    return response
  }
  const transport = new StreamableHTTPClientTransport(resource, {
    fetch: observedFetch,
    requestInit: { headers: { authorization: `Bearer ${bearer}` } },
  })
  const client = new Client(
    { name: 'better-convex-rc-conformance', version: '1.0.0' },
    { versionNegotiation: { mode: { pin: MCP_RC_PROTOCOL_VERSION } } },
  )
  try {
    await client.connect(transport)
    await client.listTools()
  } finally {
    await client.close().catch(() => {})
  }

  if (exchanges.length !== 2) {
    throw new Error(`MCP RC conformance observed ${exchanges.length} requests; expected 2`)
  }
  const [discover, tools] = exchanges
  if (
    discover.requestBody?.method !== 'server/discover' ||
    tools.requestBody?.method !== 'tools/list'
  ) {
    throw new Error('MCP RC conformance did not use stateless discovery and tool listing')
  }
  for (const [description, exchange] of [
    ['discovery', discover],
    ['tool listing', tools],
  ]) {
    if (
      exchange.status !== 200 ||
      exchange.requestHeaders.get('mcp-protocol-version') !== MCP_RC_PROTOCOL_VERSION ||
      exchange.requestHeaders.get('mcp-method') !== exchange.requestBody.method ||
      exchange.requestHeaders.has('mcp-session-id') ||
      exchange.responseHeaders.has('mcp-session-id')
    ) {
      throw new Error(`MCP RC ${description} violated the stateless HTTP envelope`)
    }
    const meta = exchange.requestBody.params?._meta
    if (
      meta?.['io.modelcontextprotocol/protocolVersion'] !== MCP_RC_PROTOCOL_VERSION ||
      typeof meta?.['io.modelcontextprotocol/clientInfo']?.name !== 'string' ||
      !meta?.['io.modelcontextprotocol/clientCapabilities']
    ) {
      throw new Error(`MCP RC ${description} omitted required per-request metadata`)
    }
    requireRcResultMetadata(exchange.responseBody?.result, description)
  }

  const discoverResult = discover.responseBody.result
  const capabilities = Object.keys(discoverResult.capabilities ?? {}).sort()
  if (
    JSON.stringify(discoverResult.supportedVersions) !==
      JSON.stringify([MCP_RC_PROTOCOL_VERSION]) ||
    JSON.stringify(capabilities) !== JSON.stringify(MCP_RC_EXPECTED_CAPABILITIES) ||
    discoverResult.ttlMs !== 0 ||
    discoverResult.cacheScope !== 'private'
  ) {
    throw new Error('MCP RC discovery advertised an unsupported or cache-unsafe capability')
  }
  const toolsResult = tools.responseBody.result
  if (
    toolsResult.ttlMs !== 0 ||
    toolsResult.cacheScope !== 'private' ||
    !Array.isArray(toolsResult.tools) ||
    toolsResult.tools.length === 0 ||
    toolsResult.tools.some(
      (tool) =>
        tool?.inputSchema?.type !== 'object' ||
        tool.inputSchema.$schema !== 'https://json-schema.org/draft/2020-12/schema',
    )
  ) {
    throw new Error('MCP RC tool listing escaped the private zero-TTL schema profile')
  }

  const raw = async (body, headers) => {
    const response = await fetch(
      new Request(resource, {
        body: JSON.stringify(body),
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${bearer}`,
          'content-type': 'application/json',
          'mcp-protocol-version': MCP_RC_PROTOCOL_VERSION,
          ...headers,
        },
        method: 'POST',
      }),
    )
    const evidence = {
      body: await readRcResponse(response),
      status: response.status,
    }
    if (JSON.stringify(evidence).includes(bearer)) {
      throw new Error('MCP RC conformance response exposed its bearer')
    }
    return evidence
  }
  requireRcError(await raw(tools.requestBody, {}), 400, -32020, 'missing method header')
  requireRcError(
    await raw(tools.requestBody, { 'mcp-method': 'prompts/list' }),
    400,
    -32020,
    'method mismatch',
  )
  for (const [method, description] of [
    ['prompts/list', 'prompt operation'],
    ['resources/list', 'resource operation'],
    ['tasks/get', 'Tasks operation'],
  ]) {
    const unsupported = structuredClone(tools.requestBody)
    unsupported.method = method
    requireRcError(
      await raw(unsupported, { 'mcp-method': method }),
      404,
      -32601,
      `unadvertised ${description}`,
    )
  }
  const call = structuredClone(tools.requestBody)
  call.method = 'tools/call'
  call.params = {
    ...call.params,
    name: toolsResult.tools[0].name,
    arguments: {},
  }
  requireRcError(
    await raw(call, { 'mcp-method': 'tools/call', 'mcp-name': 'wrong-tool-name' }),
    400,
    -32020,
    'tool-name mismatch',
  )

  return Object.freeze({
    capabilities: Object.freeze(capabilities),
    protocolVersion: MCP_RC_PROTOCOL_VERSION,
    requests: exchanges.length,
    toolCount: toolsResult.tools.length,
  })
}

export function relayAuthorityError(input) {
  const expectedHost = `${MCP_CONFORMANCE_HOST}:${MCP_CONFORMANCE_PORT}`
  if (input.get('host') !== expectedHost) return 'MCP_RELAY_INVALID_HOST'
  const origin = input.get('origin')
  if (origin !== null && origin !== MCP_CONFORMANCE_ORIGIN) return 'MCP_RELAY_INVALID_ORIGIN'
  return undefined
}

async function readBoundedBody(request) {
  const chunks = []
  let total = 0
  for await (const chunk of request) {
    total += chunk.length
    if (total > MAX_RELAY_BODY_BYTES) throw new Error('RELAY_BODY_TOO_LARGE')
    chunks.push(chunk)
  }
  return chunks.length === 0 ? undefined : Buffer.concat(chunks)
}

function sendJson(response, status, code) {
  const body = Buffer.from(JSON.stringify({ code }))
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-length': String(body.byteLength),
    'content-type': 'application/json',
  })
  response.end(body)
}

export function createAuthenticatedRelay({ bearer, fetch = globalThis.fetch, upstream }) {
  return createServer(async (request, response) => {
    try {
      const authorityError = relayAuthorityError(new Headers(request.headers))
      if (authorityError) return sendJson(response, 403, authorityError)
      if (request.url !== '/mcp') return sendJson(response, 404, 'MCP_RELAY_NOT_FOUND')
      if (!['DELETE', 'GET', 'POST'].includes(request.method ?? '')) {
        response.setHeader('allow', 'GET, POST, DELETE')
        return sendJson(response, 405, 'MCP_RELAY_METHOD_NOT_ALLOWED')
      }

      const body = await readBoundedBody(request)
      if (request.method !== 'POST' && body !== undefined) {
        return sendJson(response, 400, 'MCP_RELAY_BODY_FORBIDDEN')
      }
      const headers = buildRelayRequestHeaders(new Headers(request.headers), bearer)
      const upstreamResponse = await fetch(upstream, {
        body,
        headers,
        method: request.method,
        redirect: 'manual',
        signal: AbortSignal.timeout(RELAY_TIMEOUT_MS),
      })
      if (isRedirectResponse(upstreamResponse.status)) {
        await upstreamResponse.body?.cancel().catch(() => {})
        return sendJson(response, 502, 'MCP_RELAY_UPSTREAM_REDIRECT_REJECTED')
      }

      response.writeHead(
        upstreamResponse.status,
        Object.fromEntries(buildRelayResponseHeaders(upstreamResponse.headers)),
      )
      if (!upstreamResponse.body) return response.end()
      const reader = upstreamResponse.body.getReader()
      try {
        while (true) {
          const result = await reader.read()
          if (result.done) break
          if (!response.write(result.value)) {
            await new Promise((ready) => response.once('drain', ready))
          }
        }
        response.end()
      } finally {
        reader.releaseLock()
      }
    } catch (error) {
      if (response.headersSent) return response.destroy()
      if (error instanceof Error && error.message === 'RELAY_BODY_TOO_LARGE') {
        return sendJson(response, 413, 'MCP_RELAY_BODY_TOO_LARGE')
      }
      if (error instanceof Error && error.name === 'TimeoutError') {
        return sendJson(response, 504, 'MCP_RELAY_UPSTREAM_TIMEOUT')
      }
      return sendJson(response, 502, 'MCP_RELAY_UPSTREAM_UNAVAILABLE')
    }
  })
}

async function listen(server) {
  await new Promise((ready, reject) => {
    server.once('error', reject)
    server.listen(MCP_CONFORMANCE_PORT, MCP_CONFORMANCE_HOST, ready)
  })
}

async function close(server) {
  if (!server.listening) return
  await new Promise((ready, reject) => server.close((error) => (error ? reject(error) : ready())))
}

function terminate(child) {
  if (!child.pid || child.exitCode !== null) return
  if (process.platform === 'win32') child.kill('SIGTERM')
  else {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      child.kill('SIGTERM')
    }
  }
}

async function runConformanceScenario(root, scenario, timeoutMs) {
  const env = { ...process.env }
  delete env.BCN_MCP_CONFORMANCE_BEARER
  const child = spawn('pnpm', buildConformanceArgs(scenario), {
    cwd: root,
    detached: process.platform !== 'win32',
    env,
    stdio: 'inherit',
  })
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    terminate(child)
  }, timeoutMs)
  const result = await new Promise((ready, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => ready({ code, signal }))
  }).finally(() => clearTimeout(timeout))
  if (timedOut) throw new Error(`MCP conformance scenario ${scenario} timed out`)
  if (result.code !== 0) {
    throw new Error(
      `MCP conformance scenario ${scenario} exited with ${result.code ?? result.signal ?? 'unknown status'}`,
    )
  }
}

async function runConformanceScenarios(root) {
  const deadline = Date.now() + SUITE_TIMEOUT_MS
  for (const scenario of MCP_CONFORMANCE_SCENARIOS) {
    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) throw new Error('MCP conformance timed out after 900 seconds')
    await runConformanceScenario(root, scenario, remainingMs)
  }
}

async function findChecks(directory) {
  const found = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) found.push(...(await findChecks(path)))
    else if (entry.name === 'checks.json') found.push(path)
  }
  return found
}

export function countFailedChecks(value) {
  if (Array.isArray(value)) return value.reduce((total, item) => total + countFailedChecks(item), 0)
  if (!value || typeof value !== 'object') return 0
  let failed = 0
  for (const [key, item] of Object.entries(value)) {
    if (key === 'status' && typeof item === 'string' && item.toUpperCase() === 'FAILURE') failed++
    else failed += countFailedChecks(item)
  }
  return failed
}

async function verifyChecks(outputDirectory) {
  const files = await findChecks(outputDirectory).catch(() => [])
  if (files.length !== MCP_CONFORMANCE_SCENARIOS.length) {
    throw new Error(
      `MCP conformance produced ${files.length} checks.json file(s); expected ${MCP_CONFORMANCE_SCENARIOS.length}`,
    )
  }
  let failures = 0
  for (const scenario of MCP_CONFORMANCE_SCENARIOS) {
    const matches = files.filter((file) =>
      basename(dirname(file)).startsWith(`server-${scenario}-`),
    )
    if (matches.length !== 1) {
      throw new Error(
        `MCP conformance scenario ${scenario} produced ${matches.length} checks.json file(s); expected 1`,
      )
    }
    failures += countFailedChecks(JSON.parse(await readFile(matches[0], 'utf8')))
  }
  if (failures !== 0)
    throw new Error(`MCP conformance evidence contains ${failures} failed check(s)`)
  return files.length
}

export async function runConformanceEvidence({
  bearer,
  origin: originValue,
  root = process.cwd(),
}) {
  if (!originValue || !bearer)
    throw new Error('MCP conformance evidence requires an origin and bearer')
  const origin = normalizeEvidenceOrigin(originValue)
  const upstream = `${origin}/mcp`
  buildRelayRequestHeaders(new Headers(), bearer)
  const outputDirectory = resolve(root, MCP_CONFORMANCE_OUTPUT)
  await rm(outputDirectory, { force: true, recursive: true })

  const rc = await runRcProtocolConformance({ bearer, endpoint: upstream })
  console.log(
    `MCP ${rc.protocolVersion} RC conformance passed (${rc.requests} stateless requests, ${rc.toolCount} tools, capabilities: ${rc.capabilities.join(', ')}).`,
  )

  const relay = createAuthenticatedRelay({ bearer, upstream })
  try {
    await listen(relay)
    console.log(`MCP conformance relay ready at ${MCP_CONFORMANCE_URL}`)
    await runConformanceScenarios(root)
    const count = await verifyChecks(outputDirectory)
    console.log(
      `Official MCP ${MCP_CONFORMANCE_SPEC_VERSION} advertised-surface conformance passed (${count} checks.json file(s)); @modelcontextprotocol/conformance@0.1.16 does not yet advertise ${MCP_RC_PROTOCOL_VERSION} scenarios.`,
    )
  } finally {
    await close(relay)
  }
}

export async function main() {
  const { runMcpEvidence } = await import('./run-mcp-auth.mjs')
  await runMcpEvidence({
    conformanceRunner: runConformanceEvidence,
    includeConformance: true,
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
