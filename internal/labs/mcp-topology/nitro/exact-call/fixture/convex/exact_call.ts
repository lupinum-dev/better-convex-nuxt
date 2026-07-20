import { convexToJson, jsonToConvex, type JSONValue, type Value } from 'convex/values'

import { internal } from './_generated/api'
import { httpAction, type ActionCtx } from './_generated/server'
import {
  ServiceCallProofError,
  verifyServiceCallProof,
  type ServiceCallOperation,
} from './service_call_proof'

const PROOF_ISSUER = 'better-convex-nitro-lab'
const PROOF_AUDIENCE = 'convex-lab-deployment'
const SERVICE_ID = 'nitro-mcp-gateway'
const MCP_ISSUER = 'https://auth.example.test/'
const MCP_RESOURCE = 'https://app.example.test/mcp'
const MAX_BODY_BYTES = 16 * 1024
const MAX_BODY_TIME_MS = 1_000

type ExactActor = { issuer: string; subject: string }
type ParsedArgs = Record<string, Value>

class BoundaryError extends Error {
  readonly code: string
  readonly status: number

  constructor(status: number, code: string) {
    super(code)
    this.name = 'BoundaryError'
    this.code = code
    this.status = status
  }
}

interface ExactCallDefinition<Args extends ParsedArgs> {
  readonly functionName: string
  readonly invoke: (ctx: ActionCtx, actor: ExactActor, args: Args) => Promise<unknown>
  readonly operation: ServiceCallOperation
  readonly parse: (value: unknown) => Args | null
  readonly requiredScope: string
}

function noStoreJson(status: number, value: unknown): Response {
  return Response.json(value, { headers: { 'cache-control': 'no-store' }, status })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function boundedString(value: unknown, maximum: number): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum) return false
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code < 32 || code === 127) return false
  }
  return true
}

function parseSearchArgs(value: unknown) {
  if (!isRecord(value) || !hasExactKeys(value, ['query', 'workspaceId'])) return null
  if (!boundedString(value.query, 200) || !boundedString(value.workspaceId, 128)) return null
  return { query: value.query, workspaceId: value.workspaceId }
}

function parseRenameArgs(value: unknown) {
  if (!isRecord(value) || !hasExactKeys(value, ['noteId', 'requestKey', 'title'])) return null
  if (
    !boundedString(value.noteId, 128) ||
    !boundedString(value.requestKey, 128) ||
    !boundedString(value.title, 120)
  ) {
    return null
  }
  return { noteId: value.noteId, requestKey: value.requestKey, title: value.title }
}

function parseReportArgs(value: unknown) {
  if (!isRecord(value) || !hasExactKeys(value, ['requestKey', 'workspaceId'])) return null
  if (!boundedString(value.requestKey, 128) || !boundedString(value.workspaceId, 128)) return null
  return { requestKey: value.requestKey, workspaceId: value.workspaceId }
}

async function readBoundedConvexValue(request: Request): Promise<Value> {
  const url = new URL(request.url)
  if (url.search || url.hash) throw new BoundaryError(404, 'EXACT_CALL_ROUTE_NOT_FOUND')
  if (request.headers.has('cookie') || request.headers.has('origin')) {
    throw new BoundaryError(400, 'EXACT_CALL_REQUEST_INVALID')
  }
  if (request.headers.get('content-type') !== 'application/json') {
    throw new BoundaryError(415, 'EXACT_CALL_CONTENT_TYPE_INVALID')
  }

  const declared = request.headers.get('content-length')
  if (declared === null) throw new BoundaryError(411, 'EXACT_CALL_LENGTH_REQUIRED')
  if (!/^(?:0|[1-9]\d*)$/u.test(declared)) {
    throw new BoundaryError(400, 'EXACT_CALL_LENGTH_INVALID')
  }
  const expectedLength = Number(declared)
  if (!Number.isSafeInteger(expectedLength)) {
    throw new BoundaryError(400, 'EXACT_CALL_LENGTH_INVALID')
  }
  if (expectedLength > MAX_BODY_BYTES) {
    throw new BoundaryError(413, 'EXACT_CALL_BODY_TOO_LARGE')
  }
  if (!request.body) throw new BoundaryError(400, 'EXACT_CALL_BODY_INVALID')

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  const deadline = Date.now() + MAX_BODY_TIME_MS
  let total = 0
  try {
    while (true) {
      const remaining = deadline - Date.now()
      if (remaining <= 0) throw new BoundaryError(408, 'EXACT_CALL_BODY_TIMEOUT')
      let timeout: ReturnType<typeof setTimeout> | undefined
      const stopped = new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new BoundaryError(408, 'EXACT_CALL_BODY_TIMEOUT')),
          remaining,
        )
      })
      try {
        const chunk = await Promise.race([reader.read(), stopped])
        if (chunk.done) break
        total += chunk.value.byteLength
        if (total > MAX_BODY_BYTES) throw new BoundaryError(413, 'EXACT_CALL_BODY_TOO_LARGE')
        chunks.push(chunk.value)
      } finally {
        if (timeout !== undefined) clearTimeout(timeout)
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
  if (total !== expectedLength) throw new BoundaryError(400, 'EXACT_CALL_LENGTH_MISMATCH')

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    const encoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    const json = JSON.parse(encoded) as JSONValue
    const value = jsonToConvex(json)
    // The controlled Nitro hop sends Convex's one canonical wire form. Reject
    // alternate encodings so bytes cannot change while their semantic digest
    // stays equal (including object-order and __proto__ tricks).
    if (JSON.stringify(convexToJson(value)) !== encoded) {
      throw new BoundaryError(400, 'EXACT_CALL_BODY_INVALID')
    }
    return value
  } catch {
    throw new BoundaryError(400, 'EXACT_CALL_BODY_INVALID')
  }
}

function extractProof(request: Request): string {
  const authorization = request.headers.get('authorization')
  if (!authorization || !authorization.startsWith('ServiceCall ')) {
    throw new ServiceCallProofError()
  }
  const proof = authorization.slice('ServiceCall '.length)
  if (!proof || proof.includes(' ')) throw new ServiceCallProofError()
  return proof
}

async function loadPublicKeys(): Promise<Readonly<Record<string, CryptoKey>>> {
  const configured = process.env.BCN_VNEXT_EXACT_CALL_PUBLIC_KEYS
  if (!configured || configured.length > 8_192) throw new ServiceCallProofError()
  let value: unknown
  try {
    value = JSON.parse(configured)
  } catch {
    throw new ServiceCallProofError()
  }
  if (!isRecord(value) || Object.keys(value).length < 1 || Object.keys(value).length > 3) {
    throw new ServiceCallProofError()
  }

  const keys: Record<string, CryptoKey> = Object.create(null) as Record<string, CryptoKey>
  for (const [keyId, candidate] of Object.entries(value)) {
    if (!/^(?!_)[\w.-]{1,64}$/u.test(keyId) || !isRecord(candidate)) {
      throw new ServiceCallProofError()
    }
    if (
      candidate.alg !== 'EdDSA' ||
      candidate.crv !== 'Ed25519' ||
      candidate.kty !== 'OKP' ||
      candidate.use !== 'sig' ||
      !Array.isArray(candidate.key_ops) ||
      candidate.key_ops.length !== 1 ||
      candidate.key_ops[0] !== 'verify'
    ) {
      throw new ServiceCallProofError()
    }
    try {
      keys[keyId] = await crypto.subtle.importKey(
        'jwk',
        candidate as JsonWebKey,
        'Ed25519',
        false,
        ['verify'],
      )
    } catch {
      throw new ServiceCallProofError()
    }
  }
  return Object.freeze(keys)
}

function createExactCallHandler<Args extends ParsedArgs>(
  definition: ExactCallDefinition<Args>,
): ReturnType<typeof httpAction> {
  return httpAction(async (ctx, request) => {
    try {
      const raw = await readBoundedConvexValue(request)
      const args = definition.parse(raw)
      if (!args) throw new BoundaryError(400, 'EXACT_CALL_ARGUMENTS_INVALID')
      const verified = await verifyServiceCallProof(extractProof(request), {
        args,
        audience: PROOF_AUDIENCE,
        functionName: definition.functionName,
        issuer: PROOF_ISSUER,
        mcpIssuer: MCP_ISSUER,
        mcpResource: MCP_RESOURCE,
        nowSeconds: Math.floor(Date.now() / 1_000),
        operation: definition.operation,
        publicKeys: await loadPublicKeys(),
        requiredScope: definition.requiredScope,
        serviceId: SERVICE_ID,
      })
      const actor = { issuer: verified.mcp.issuer, subject: verified.mcp.subject }
      return noStoreJson(200, await definition.invoke(ctx, actor, args))
    } catch (error) {
      if (error instanceof BoundaryError) return noStoreJson(error.status, { code: error.code })
      if (error instanceof ServiceCallProofError) {
        return noStoreJson(401, { code: 'EXACT_CALL_REJECTED' })
      }
      return noStoreJson(502, { code: 'EXACT_CALL_FAILED' })
    }
  })
}

export const searchNotes = createExactCallHandler({
  functionName: 'application:searchNotes',
  invoke: async (ctx, actor, args): Promise<unknown> =>
    ctx.runQuery(internal.application.searchNotes, { actor, ...args }),
  operation: 'query',
  parse: parseSearchArgs,
  requiredScope: 'notes:read',
})

export const renameNote = createExactCallHandler({
  functionName: 'application:renameNote',
  invoke: async (ctx, actor, args): Promise<unknown> =>
    ctx.runMutation(internal.application.renameNote, { actor, ...args }),
  operation: 'mutation',
  parse: parseRenameArgs,
  requiredScope: 'notes:write',
})

export const generateReport = createExactCallHandler({
  functionName: 'application_action:generateReport',
  invoke: async (ctx, actor, args): Promise<unknown> =>
    ctx.runAction(internal.application_action.generateReport, { actor, ...args }),
  operation: 'action',
  parse: parseReportArgs,
  requiredScope: 'notes:read',
})
