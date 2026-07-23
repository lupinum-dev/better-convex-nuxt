import {
  createConvexMcpHandler,
  runMcpTool,
  type McpAccessContext,
  type McpAccessVerifier,
} from '@better-convex/mcp'
import { ResourceTemplate, type McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'

import { internal } from './_generated/api'
import { httpAction, type ActionCtx } from './_generated/server'
import { NOTES_DASHBOARD_HTML } from './notes_dashboard'
import { createLabOAuthVerifier, labOAuthMetadataOptions, labOAuthSubject } from './oauth_fixture'

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

type OperationResult<Value> =
  | { readonly code: string; readonly ok: false }
  | { readonly ok: true; readonly value: Value }

function projectToolResult<Value>(result: OperationResult<Value>, text: (value: Value) => string) {
  if (!result.ok) {
    return {
      content: [{ text: JSON.stringify({ code: result.code }), type: 'text' as const }],
      isError: true,
    }
  }
  return {
    content: [{ text: text(result.value), type: 'text' as const }],
    structuredContent: result.value,
  }
}

function createNotesServer(
  ctx: ActionCtx,
  principal: LabPrincipal,
  access: McpAccessContext,
  server: McpServer,
): void {
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
      runMcpTool(
        async () => {
          const result = await ctx.runQuery(internal.operations.searchNotes, {
            ...input,
            principal,
          })
          return projectToolResult(
            result,
            (value) =>
              `${value.matches.length} note${value.matches.length === 1 ? '' : 's'} matched.`,
          )
        },
        {
          operation: 'query',
          toolName: 'search_notes',
          functionName: 'operations:searchNotes',
        },
      ),
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
    async (input) =>
      runMcpTool(
        async () => {
          if (!access.scopes.includes('notes:write')) {
            return projectToolResult({ code: 'ACCESS_DENIED', ok: false }, () => '')
          }
          const result = await ctx.runMutation(internal.operations.renameNote, {
            ...input,
            principal,
          })
          return projectToolResult(result, (value) => `Renamed ${value.noteId}.`)
        },
        {
          operation: 'mutation',
          toolName: 'rename_note',
          functionName: 'operations:renameNote',
        },
      ),
  )

  server.registerTool(
    'delete_workspace',
    {
      description: 'Delete one workspace after current membership and revision checks.',
      inputSchema: z
        .object({
          expectedRevision: z.number().int().positive(),
          workspaceId: z.string(),
        })
        .strict(),
      outputSchema: deletedWorkspaceSchema,
    },
    async (input) =>
      runMcpTool(
        async () => {
          if (!access.scopes.includes('notes:write')) {
            return projectToolResult({ code: 'ACCESS_DENIED', ok: false }, () => '')
          }
          const result = await ctx.runMutation(internal.operations.deleteWorkspace, {
            ...input,
            principal,
          })
          return projectToolResult(result, (value) => `Deleted workspace ${value.workspaceId}.`)
        },
        {
          operation: 'mutation',
          toolName: 'delete_workspace',
          functionName: 'operations:deleteWorkspace',
        },
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
      runMcpTool(
        async () => {
          const result = await ctx.runQuery(internal.operations.generateReport, {
            ...input,
            principal,
          })
          return projectToolResult(result, (value) => `Generated report ${value.reportId}.`)
        },
        {
          operation: 'query',
          toolName: 'generate_report',
          functionName: 'operations:generateReport',
        },
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
}

function createVerifier(resource: URL): McpAccessVerifier {
  const verifier = createLabOAuthVerifier(resource)
  return {
    async verifyAccessToken(token, expectedResource) {
      const authInfo = await verifier.verifyAccessToken(token)
      if (authInfo.resource?.href !== expectedResource.href || authInfo.expiresAt === undefined) {
        throw new Error('MCP_ACCESS_INVALID')
      }
      return {
        access: {
          issuer: 'https://issuer.example/api/auth',
          subject: labOAuthSubject(authInfo),
          clientId: authInfo.clientId,
          resource: authInfo.resource.href,
          scopes: authInfo.scopes,
        },
        expiresAt: authInfo.expiresAt,
      }
    },
  }
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

async function handleRequest(ctx: ActionCtx, request: Request): Promise<Response> {
  const resource = new URL('/mcp', request.url)
  const metadata = labOAuthMetadataOptions(resource)
  const handler = createConvexMcpHandler({
    serverInfo: {
      name: 'better-convex-convex-topology-lab',
      version: '0.0.0',
    },
    resource,
    verifier: createVerifier(resource),
    authorization: {
      mode: 'oauth',
      metadata: metadata.oauthMetadata,
      resourceName: metadata.resourceName,
      requiredScopes: ['notes:read'],
      scopesSupported: metadata.scopesSupported,
    },
    configureServer: (_context, access, _request, server) =>
      createNotesServer(ctx, Object.freeze({ subject: access.subject }), access, server),
  })
  const response = await handler.fetch(ctx, request)
  return new URL(request.url).pathname === '/mcp' && !request.headers.has('origin')
    ? markCanonicalBearerBoundary(response)
    : response
}

export const handleMcp = httpAction(handleRequest)
export const handleOAuthMetadata = httpAction(handleRequest)
