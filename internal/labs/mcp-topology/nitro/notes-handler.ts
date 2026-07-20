import {
  createMcpHandler,
  McpServer,
  originValidationResponse,
  ResourceTemplate,
  type AuthInfo,
  type McpHttpHandler,
} from '@modelcontextprotocol/server'
import { z } from 'zod'

import {
  NotesApplicationError,
  type NeutralNotesApplication,
  type NotesApplicationActor,
} from '../neutral/notes-application'

const noteSchema = z.object({
  body: z.string(),
  id: z.string(),
  revision: z.number().int().positive(),
  title: z.string(),
  uri: z.string(),
  workspaceId: z.string(),
})

const renameReceiptSchema = z.object({
  changed: z.boolean(),
  noteId: z.string(),
  previousTitle: z.string(),
  requestKey: z.string(),
  revision: z.number().int().positive(),
  title: z.string(),
})

const reportSchema = z.object({
  generatedAt: z.number().int(),
  noteCount: z.number().int().nonnegative(),
  reportId: z.string(),
  titles: z.array(z.string()),
  workspaceId: z.string(),
  workspaceRevision: z.number().int().positive(),
})

const deletedWorkspaceSchema = z.object({
  deletedAt: z.number().int(),
  deletedNoteCount: z.number().int().nonnegative(),
  revision: z.number().int().positive(),
  workspaceId: z.string(),
})

const ACTOR_EXTRA_KEY = 'betterConvexLabActor'
export const NITRO_MCP_LAB_MAX_BODY_BYTES = 64 * 1024
export const NITRO_MCP_LAB_BODY_TIMEOUT_MS = 1_000

class RequestBoundaryError extends Error {
  readonly code: string
  readonly status: number

  constructor(status: number, code: string) {
    super(code)
    this.name = 'RequestBoundaryError'
    this.status = status
    this.code = code
  }
}

export interface NitroNotesVerifiedAccess {
  readonly actor: NotesApplicationActor
  readonly authInfo: AuthInfo
}

export interface NitroNotesMcpHandler {
  close(): Promise<void>
  fetch(request: Request, access: NitroNotesVerifiedAccess): Promise<Response>
}

function isActor(value: unknown): value is NotesApplicationActor {
  if (!value || typeof value !== 'object') return false
  const actor = value as Partial<NotesApplicationActor>
  return (
    (actor.role === 'editor' || actor.role === 'owner') &&
    typeof actor.subject === 'string' &&
    actor.subject.length > 0 &&
    typeof actor.tenantId === 'string' &&
    actor.tenantId.length > 0
  )
}

function actorFromAuthInfo(authInfo: AuthInfo | undefined): NotesApplicationActor {
  const actor = authInfo?.extra?.[ACTOR_EXTRA_KEY]
  if (!isActor(actor)) throw new Error('MCP lab access context is missing')
  return Object.freeze({ role: actor.role, subject: actor.subject, tenantId: actor.tenantId })
}

function jsonText(value: unknown): string {
  return JSON.stringify(value)
}

function noStore(response: Response): Response {
  const headers = new Headers(response.headers)
  headers.set('cache-control', 'no-store')
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  })
}

function boundaryErrorResponse(error: RequestBoundaryError): Response {
  return noStore(Response.json({ code: error.code }, { status: error.status }))
}

function declaredBodyLength(request: Request): number | null {
  const value = request.headers.get('content-length')
  if (value === null) return null
  if (!/^(?:0|[1-9]\d*)$/u.test(value)) {
    throw new RequestBoundaryError(400, 'MCP_REQUEST_LENGTH_INVALID')
  }
  const length = Number(value)
  if (!Number.isSafeInteger(length)) {
    throw new RequestBoundaryError(400, 'MCP_REQUEST_LENGTH_INVALID')
  }
  if (length > NITRO_MCP_LAB_MAX_BODY_BYTES) {
    throw new RequestBoundaryError(413, 'MCP_REQUEST_BODY_TOO_LARGE')
  }
  return length
}

async function readBodyWithinBoundary(
  request: Request,
  declaredLength: number | null,
): Promise<Uint8Array | undefined> {
  if (!request.body) return undefined

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  const deadline = Date.now() + NITRO_MCP_LAB_BODY_TIMEOUT_MS
  let total = 0

  try {
    while (true) {
      if (request.signal.aborted) {
        throw new RequestBoundaryError(499, 'MCP_REQUEST_ABORTED')
      }
      const remaining = deadline - Date.now()
      if (remaining <= 0) throw new RequestBoundaryError(408, 'MCP_REQUEST_BODY_TIMEOUT')

      let timeout: ReturnType<typeof setTimeout> | undefined
      let abortListener: (() => void) | undefined
      const stopped = new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new RequestBoundaryError(408, 'MCP_REQUEST_BODY_TIMEOUT')),
          remaining,
        )
        abortListener = () => reject(new RequestBoundaryError(499, 'MCP_REQUEST_ABORTED'))
        request.signal.addEventListener('abort', abortListener, { once: true })
      })

      try {
        const result = await Promise.race([reader.read(), stopped])
        if (result.done) break
        total += result.value.byteLength
        if (total > NITRO_MCP_LAB_MAX_BODY_BYTES) {
          throw new RequestBoundaryError(413, 'MCP_REQUEST_BODY_TOO_LARGE')
        }
        chunks.push(result.value)
      } finally {
        if (timeout !== undefined) clearTimeout(timeout)
        if (abortListener) request.signal.removeEventListener('abort', abortListener)
      }
    }
  } catch (error) {
    await reader.cancel().catch(() => {})
    if (error instanceof RequestBoundaryError) throw error
    throw new RequestBoundaryError(400, 'MCP_REQUEST_BODY_UNREADABLE')
  } finally {
    reader.releaseLock()
  }

  if (declaredLength !== null && declaredLength !== total) {
    throw new RequestBoundaryError(400, 'MCP_REQUEST_LENGTH_MISMATCH')
  }

  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

async function prepareRequest(request: Request, expectedPath: string): Promise<Request> {
  const url = new URL(request.url)
  if (url.pathname !== expectedPath || url.search || url.hash) {
    throw new RequestBoundaryError(404, 'MCP_ROUTE_NOT_FOUND')
  }
  if (request.headers.has('content-encoding')) {
    throw new RequestBoundaryError(415, 'MCP_REQUEST_ENCODING_UNSUPPORTED')
  }
  const declaredLength = declaredBodyLength(request)
  const body = await readBodyWithinBoundary(request, declaredLength)
  if (!body) return new Request(request, { body: null })
  const copy = new Uint8Array(body.byteLength)
  copy.set(body)
  return new Request(request, { body: copy.buffer })
}

async function runTool<T>(operation: () => T | Promise<T>) {
  try {
    const structuredContent = await operation()
    return {
      content: [{ type: 'text' as const, text: jsonText(structuredContent) }],
      structuredContent,
    }
  } catch (error) {
    const code = error instanceof NotesApplicationError ? error.code : 'OPERATION_FAILED'
    return {
      content: [{ type: 'text' as const, text: jsonText({ code }) }],
      isError: true,
    }
  }
}

function createNotesServer(
  application: NeutralNotesApplication,
  actor: NotesApplicationActor,
): McpServer {
  const server = new McpServer({ name: 'better-convex-nitro-topology-lab', version: '0.0.0' })

  server.registerTool(
    'search_notes',
    {
      description: 'Search notes visible to the current application actor.',
      inputSchema: z
        .object({
          limit: z.number().int().min(1).max(50).optional(),
          query: z.string().max(200),
          workspaceId: z.string(),
        })
        .strict(),
      outputSchema: z.object({ matches: z.array(noteSchema) }),
    },
    async (input) => runTool(() => ({ matches: application.searchNotes(actor, input) })),
  )

  server.registerTool(
    'rename_note',
    {
      description: 'Rename one note with an application-owned idempotency key.',
      inputSchema: z
        .object({
          noteId: z.string(),
          requestKey: z.string(),
          title: z.string(),
        })
        .strict(),
      outputSchema: renameReceiptSchema,
    },
    async (input) => runTool(() => application.renameNote(actor, input)),
  )

  server.registerTool(
    'delete_workspace',
    {
      description: 'Delete one workspace after application-owned role and revision checks.',
      inputSchema: z
        .object({
          expectedRevision: z.number().int().positive(),
          workspaceId: z.string(),
        })
        .strict(),
      outputSchema: deletedWorkspaceSchema,
    },
    async (input) => runTool(() => application.deleteWorkspace(actor, input)),
  )

  server.registerTool(
    'generate_report',
    {
      description: 'Generate a bounded report from current application state.',
      inputSchema: z.object({ workspaceId: z.string() }).strict(),
      outputSchema: reportSchema,
    },
    async (input) => runTool(() => application.generateReport(actor, input)),
  )

  server.registerResource(
    'note',
    new ResourceTemplate('note://{id}', { list: undefined }),
    { description: 'Read one note visible to the current application actor.' },
    async (uri) => ({ contents: [application.readNoteResource(actor, { uri: uri.href })] }),
  )

  return server
}

function withActor(authInfo: AuthInfo, actor: NotesApplicationActor): AuthInfo {
  return {
    ...authInfo,
    extra: {
      ...authInfo.extra,
      [ACTOR_EXTRA_KEY]: {
        role: actor.role,
        subject: actor.subject,
        tenantId: actor.tenantId,
      },
    },
  }
}

/** Private Nitro/Web-standard topology probe. It is not a public runtime adapter. */
export function createNitroNotesMcpHandler(
  application: NeutralNotesApplication,
  expectedPath = '/mcp',
): NitroNotesMcpHandler {
  if (!expectedPath.startsWith('/') || expectedPath.includes('?') || expectedPath.includes('#')) {
    throw new TypeError('The private MCP lab path must be one exact pathname')
  }
  const handler: McpHttpHandler = createMcpHandler(
    ({ authInfo }) => createNotesServer(application, actorFromAuthInfo(authInfo)),
    { legacy: 'stateless', responseMode: 'json' },
  )

  return {
    close: handler.close,
    fetch: async (request, access) => {
      const originRejected = originValidationResponse(request, [])
      if (originRejected) return noStore(originRejected)

      try {
        const boundedRequest = await prepareRequest(request, expectedPath)
        return noStore(
          await handler.fetch(boundedRequest, {
            authInfo: withActor(access.authInfo, access.actor),
          }),
        )
      } catch (error) {
        if (error instanceof RequestBoundaryError) return boundaryErrorResponse(error)
        return boundaryErrorResponse(new RequestBoundaryError(400, 'MCP_REQUEST_INVALID'))
      }
    },
  }
}
