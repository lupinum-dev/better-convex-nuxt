import { convexToJson, type Value } from 'convex/values'
import type { ZodType } from 'zod'

import {
  NotesApplicationError,
  type NeutralNotesOperations,
  type NotesApplicationActor,
  type NotesApplicationErrorCode,
} from '../../neutral/notes-application'
import {
  deletedWorkspaceSchema,
  noteSchema,
  notesSchema,
  renameReceiptSchema,
  reportSchema,
} from '../../neutral/notes-schemas'
import type { NitroNotesVerifiedAccess } from '../notes-handler'
import { digestConvexValue } from './canonical-convex'
import {
  signServiceCallProof,
  type ServiceCallOperation,
  type ServiceCallProofV1,
} from './service-call-proof'

const PROOF_ISSUER = 'better-convex-nitro-lab'
const PROOF_AUDIENCE = 'convex-lab-deployment'
const SERVICE_ID = 'nitro-mcp-gateway'
const maximumResponseBytes = 64 * 1024
const applicationErrorCodes = new Set<NotesApplicationErrorCode>([
  'ACCESS_DENIED',
  'IDEMPOTENCY_CONFLICT',
  'INPUT_INVALID',
  'NOTE_NOT_FOUND',
  'WORKSPACE_NOT_FOUND',
  'WORKSPACE_STALE',
])

interface ExactCallDefinition<Result> {
  readonly functionName: string
  readonly operation: ServiceCallOperation
  readonly parseResult: (value: unknown) => Result | null
  readonly path: string
}

interface ExactCallNotesOptions {
  readonly access: NitroNotesVerifiedAccess
  readonly endpoint: URL
  readonly keyId: string
  readonly privateKey: Promise<CryptoKey>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function parseSchema<Result>(schema: ZodType<Result>, value: unknown): Result | null {
  const parsed = schema.safeParse(value)
  return parsed.success ? parsed.data : null
}

function exactEndpoint(value: URL): URL {
  const endpoint = new URL(value.href)
  const loopbackHttp =
    endpoint.protocol === 'http:' &&
    (endpoint.hostname === '127.0.0.1' ||
      endpoint.hostname === '::1' ||
      endpoint.hostname === 'localhost')
  if (
    (endpoint.protocol !== 'https:' && !loopbackHttp) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    endpoint.pathname !== '/'
  ) {
    throw new TypeError('Exact-call endpoint must be one trusted deployment origin')
  }
  return endpoint
}

function accessClaims(access: NitroNotesVerifiedAccess): ServiceCallProofV1['mcp'] {
  const issuer = access.authInfo.extra?.issuer
  const subject = access.authInfo.extra?.subject
  const resource = access.authInfo.resource
  if (
    typeof issuer !== 'string' ||
    typeof subject !== 'string' ||
    subject !== access.actor.subject ||
    !(resource instanceof URL)
  ) {
    throw new Error('Verified MCP access is incomplete')
  }
  return {
    authorizationReference: null,
    clientId: access.authInfo.clientId,
    issuer,
    resource: resource.href,
    scopes: [...new Set(access.authInfo.scopes)].sort(),
    subject,
  }
}

function assertBoundActor(bound: NotesApplicationActor, received: NotesApplicationActor): void {
  if (
    bound.role !== received.role ||
    bound.subject !== received.subject ||
    bound.tenantId !== received.tenantId
  ) {
    throw new Error('MCP actor changed after exact-call binding')
  }
}

async function readBoundedResponse(response: Response): Promise<unknown> {
  const declared = response.headers.get('content-length')
  if (declared !== null) {
    if (!/^(?:0|[1-9]\d*)$/u.test(declared)) throw new Error('Exact call failed')
    const length = Number(declared)
    if (!Number.isSafeInteger(length) || length > maximumResponseBytes) {
      throw new Error('Exact call failed')
    }
  }
  if (!response.body) throw new Error('Exact call failed')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    length += value.byteLength
    if (length > maximumResponseBytes) {
      await reader.cancel()
      throw new Error('Exact call failed')
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw new Error('Exact call failed')
  }
}

/** Private Candidate B client. It is deliberately not a public service-call API. */
export function createExactCallNotesOperations(
  options: ExactCallNotesOptions,
): NeutralNotesOperations {
  const endpoint = exactEndpoint(options.endpoint)
  const mcp = accessClaims(options.access)

  const invoke = async <Result>(
    actor: NotesApplicationActor,
    args: Record<string, Value>,
    definition: ExactCallDefinition<Result>,
  ): Promise<Result> => {
    assertBoundActor(options.access.actor, actor)
    const issuedAt = Math.floor(Date.now() / 1_000)
    const claims: ServiceCallProofV1 = {
      argsDigest: await digestConvexValue(args),
      audience: PROOF_AUDIENCE,
      callId: crypto.randomUUID(),
      expiresAt: issuedAt + 15,
      functionName: definition.functionName,
      issuedAt,
      issuer: PROOF_ISSUER,
      keyId: options.keyId,
      mcp,
      operation: definition.operation,
      serviceId: SERVICE_ID,
      version: 1,
    }
    const proof = await signServiceCallProof(claims, await options.privateKey)
    const response = await fetch(new URL(definition.path, endpoint), {
      body: JSON.stringify(convexToJson(args)),
      headers: {
        authorization: `ServiceCall ${proof}`,
        'content-type': 'application/json',
      },
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(5_000),
    })
    const envelope = await readBoundedResponse(response)
    if (response.status !== 200 || !isRecord(envelope)) throw new Error('Exact call failed')
    if (envelope.ok === false && typeof envelope.code === 'string') {
      if (applicationErrorCodes.has(envelope.code as NotesApplicationErrorCode)) {
        throw new NotesApplicationError(envelope.code as NotesApplicationErrorCode)
      }
      throw new Error('Exact call failed')
    }
    if (envelope.ok !== true || !hasExactKeys(envelope, ['ok', 'value'])) {
      throw new Error('Exact call failed')
    }
    const result = definition.parseResult(envelope.value)
    if (!result) throw new Error('Exact call failed')
    return result
  }

  const operations: NeutralNotesOperations = {
    deleteWorkspace: (actor, input) =>
      invoke(actor, input, {
        functionName: 'application:deleteWorkspace',
        operation: 'mutation',
        parseResult: (value) => parseSchema(deletedWorkspaceSchema, value),
        path: '/exact-call/mutation/delete-workspace',
      }),
    generateReport: (actor, input) =>
      invoke(actor, input, {
        functionName: 'application_action:generateReport',
        operation: 'action',
        parseResult: (value) => parseSchema(reportSchema, value),
        path: '/exact-call/action/generate-report',
      }),
    readNoteResource: async (actor, input) => {
      const match = /^note:\/\/([\w-]{1,128})$/u.exec(input.uri)
      if (!match?.[1]) throw new NotesApplicationError('INPUT_INVALID')
      const note = await invoke(
        actor,
        { noteId: match[1] },
        {
          functionName: 'application:readNote',
          operation: 'query',
          parseResult: (value) => parseSchema(noteSchema, value),
          path: '/exact-call/query/read-note',
        },
      )
      return { mimeType: 'application/json' as const, text: JSON.stringify(note), uri: note.uri }
    },
    renameNote: (actor, input) =>
      invoke(actor, input, {
        functionName: 'application:renameNote',
        operation: 'mutation',
        parseResult: (value) => parseSchema(renameReceiptSchema, value),
        path: '/exact-call/mutation/rename-note',
      }),
    searchNotes: (actor, input) =>
      invoke(actor, input, {
        functionName: 'application:searchNotes',
        operation: 'query',
        parseResult: (value) => parseSchema(notesSchema, value),
        path: '/exact-call/query/search-notes',
      }),
  }
  return Object.freeze(operations)
}

export async function importExactCallPrivateKey(value: unknown): Promise<CryptoKey> {
  if (!isRecord(value) || value.alg !== 'EdDSA' || value.crv !== 'Ed25519' || value.kty !== 'OKP') {
    throw new TypeError('Exact-call signing key is invalid')
  }
  const key = await crypto.subtle.importKey('jwk', value as JsonWebKey, 'Ed25519', false, ['sign'])
  if (key.type !== 'private' || !key.usages.includes('sign')) {
    throw new TypeError('Exact-call signing key is invalid')
  }
  return key
}
