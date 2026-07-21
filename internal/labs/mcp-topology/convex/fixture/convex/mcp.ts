import {
  createMcpHandler,
  McpServer,
  originValidationResponse,
  ResourceTemplate,
  type AuthInfo,
} from '@modelcontextprotocol/server'
import { z } from 'zod'

import { internal } from './_generated/api'
import { httpAction, type ActionCtx } from './_generated/server'
import { NOTES_DASHBOARD_HTML } from './notes_dashboard'
import { labOAuthMetadataResponse, labOAuthSubject, requireLabOAuthAccess } from './oauth_fixture'

const MAX_REQUEST_BODY_BYTES = 64 * 1024
const REQUEST_BODY_TIMEOUT_MS = 1_000
const BEARER_BOUNDARY_HEADER = 'x-bcn-lab-bearer-boundary'
const NOTES_DASHBOARD_RESOURCE_URI = 'ui://notes/dashboard.html'
const NOTES_DASHBOARD_RESOURCE_MIME_TYPE = 'text/html;profile=mcp-app'
const NOTES_DASHBOARD_MAX_HTML_BYTES = 512 * 1024
if (
  !NOTES_DASHBOARD_HTML.startsWith('<!doctype html>') ||
  new TextEncoder().encode(NOTES_DASHBOARD_HTML).byteLength > NOTES_DASHBOARD_MAX_HTML_BYTES
) {
  throw new Error('MCP_APP_BUILD_INVALID')
}
const notesDashboardResourceMeta = Object.freeze({
  ui: Object.freeze({
    csp: Object.freeze({
      baseUriDomains: Object.freeze([]),
      connectDomains: Object.freeze([]),
      frameDomains: Object.freeze([]),
      resourceDomains: Object.freeze([]),
    }),
    permissions: Object.freeze({}),
    prefersBorder: true,
  }),
})

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

interface LabPrincipal {
  readonly subject: string
}

type OperationResult =
  | { readonly code: string; readonly ok: false }
  | { readonly ok: true; readonly value: unknown }

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
  if (length > MAX_REQUEST_BODY_BYTES) {
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
  const deadline = Date.now() + REQUEST_BODY_TIMEOUT_MS
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
        if (total > MAX_REQUEST_BODY_BYTES) {
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

async function prepareRequest(request: Request): Promise<Request> {
  const url = new URL(request.url)
  if (url.pathname !== '/mcp' || url.search || url.hash) {
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

function principalFromAuthInfo(authInfo: AuthInfo | undefined): LabPrincipal {
  if (!authInfo) throw new Error('MCP access context is missing')
  return Object.freeze({ subject: labOAuthSubject(authInfo) })
}

function projectToolResult(result: OperationResult) {
  if (!result.ok) {
    return {
      content: [{ text: JSON.stringify({ code: result.code }), type: 'text' as const }],
      isError: true,
    }
  }
  return {
    content: [{ text: JSON.stringify(result.value), type: 'text' as const }],
    structuredContent: result.value,
  }
}

function createNotesServer(ctx: ActionCtx, principal: LabPrincipal): McpServer {
  const server = new McpServer({ name: 'better-convex-convex-topology-lab', version: '0.0.0' })

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
      _meta: {
        ui: {
          resourceUri: NOTES_DASHBOARD_RESOURCE_URI,
          visibility: ['model', 'app'],
        },
      },
    },
    async (input) =>
      projectToolResult(
        await ctx.runQuery(internal.operations.searchNotes, { ...input, principal }),
      ),
  )

  server.registerTool(
    'rename_note',
    {
      description: 'Rename one note with an application-owned idempotency key.',
      inputSchema: z
        .object({ noteId: z.string(), requestKey: z.string(), title: z.string() })
        .strict(),
      outputSchema: renameReceiptSchema,
    },
    async (input) =>
      projectToolResult(
        await ctx.runMutation(internal.operations.renameNote, { ...input, principal }),
      ),
  )

  server.registerTool(
    'delete_workspace',
    {
      description: 'Delete one workspace after current membership and revision checks.',
      inputSchema: z
        .object({ expectedRevision: z.number().int().positive(), workspaceId: z.string() })
        .strict(),
      outputSchema: deletedWorkspaceSchema,
    },
    async (input) =>
      projectToolResult(
        await ctx.runMutation(internal.operations.deleteWorkspace, { ...input, principal }),
      ),
  )

  server.registerTool(
    'generate_report',
    {
      description: 'Generate a bounded report from current application state.',
      inputSchema: z.object({ workspaceId: z.string() }).strict(),
      outputSchema: reportSchema,
    },
    async (input) =>
      projectToolResult(
        await ctx.runQuery(internal.operations.generateReport, { ...input, principal }),
      ),
  )

  server.registerResource(
    'note',
    new ResourceTemplate('note://{id}', { list: undefined }),
    { description: 'Read one note visible to the current application actor.' },
    async (uri) => {
      const result = await ctx.runQuery(internal.operations.readNoteResource, {
        principal,
        uri: uri.href,
      })
      if (!result.ok) throw new Error('MCP_RESOURCE_UNAVAILABLE')
      return { contents: [result.value] }
    },
  )

  server.registerResource(
    'notes-dashboard',
    NOTES_DASHBOARD_RESOURCE_URI,
    {
      _meta: notesDashboardResourceMeta,
      description: 'Credential-free interactive view for the neutral notes search result.',
      mimeType: NOTES_DASHBOARD_RESOURCE_MIME_TYPE,
    },
    async (uri) => ({
      contents: [
        {
          _meta: notesDashboardResourceMeta,
          mimeType: NOTES_DASHBOARD_RESOURCE_MIME_TYPE,
          text: NOTES_DASHBOARD_HTML,
          uri: uri.href,
        },
      ],
    }),
  )

  return server
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

function markCanonicalBearerBoundary(response: Response): Response {
  const headers = new Headers(response.headers)
  headers.set(BEARER_BOUNDARY_HEADER, 'canonical-mcp')
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  })
}

export const handleMcp = httpAction(async (ctx, request) => {
  const originRejected = originValidationResponse(request, [])
  if (originRejected) return noStore(originRejected)

  const resourceServerUrl = new URL('/mcp', request.url)
  const authInfo = await requireLabOAuthAccess(request, resourceServerUrl)
  if (authInfo instanceof Response) return markCanonicalBearerBoundary(authInfo)

  let boundedRequest: Request
  try {
    boundedRequest = await prepareRequest(request)
  } catch (error) {
    if (error instanceof RequestBoundaryError) {
      return markCanonicalBearerBoundary(boundaryErrorResponse(error))
    }
    return markCanonicalBearerBoundary(
      boundaryErrorResponse(new RequestBoundaryError(400, 'MCP_REQUEST_INVALID')),
    )
  }

  const handler = createMcpHandler(
    ({ authInfo }) => createNotesServer(ctx, principalFromAuthInfo(authInfo)),
    { legacy: 'stateless', responseMode: 'json' },
  )
  try {
    return markCanonicalBearerBoundary(noStore(await handler.fetch(boundedRequest, { authInfo })))
  } finally {
    await handler.close()
  }
})

export const handleOAuthMetadata = httpAction(async (_ctx, request) => {
  const response = labOAuthMetadataResponse(request, new URL('/mcp', request.url))
  return response ?? new Response(null, { status: 404 })
})
