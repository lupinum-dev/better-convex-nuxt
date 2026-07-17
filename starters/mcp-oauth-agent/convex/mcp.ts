import { requireAuthOrigin } from 'better-convex-nuxt/convex-auth'
import { ConvexError } from 'convex/values'

import { internal } from './_generated/api'
import { httpAction } from './_generated/server'
import { serializePrincipal, type McpScope } from './mcp/policy'
import {
  MCP_PROTOCOL_VERSION,
  MCP_TOOLS,
  McpProtocolError,
  jsonRpcError,
  jsonRpcResult,
  readMcpRequest,
} from './mcp/protocol'
import { McpTokenError, extractBearerToken, verifyMcpAccessToken } from './mcp/security'

function challenge(origin: string, scope?: McpScope): string {
  const metadata = `${origin}/.well-known/oauth-protected-resource/mcp`
  return `Bearer resource_metadata="${metadata}"${scope ? `, scope="${scope}"` : ''}`
}

function authorizationFailure(
  origin: string,
  error: McpTokenError,
  requiredScope?: McpScope,
): Response {
  return Response.json(
    { code: error.code },
    {
      headers: {
        'cache-control': 'no-store',
        'content-type': 'application/json',
        'www-authenticate': challenge(origin, requiredScope),
      },
      status: error.code === 'MCP_SCOPE_REQUIRED' ? 403 : 401,
    },
  )
}

function applicationFailure(error: unknown): Response {
  const code =
    error instanceof ConvexError && typeof error.data === 'string'
      ? error.data
      : 'MCP_APPLICATION_AUTHORIZATION_FAILED'
  const status = code === 'MCP_RATE_LIMITED' ? 429 : code === 'MCP_INPUT_INVALID' ? 400 : 403
  return Response.json(
    { code },
    { headers: { 'cache-control': 'no-store', 'content-type': 'application/json' }, status },
  )
}

function toolResult(value: unknown) {
  return {
    content: [{ text: JSON.stringify(value), type: 'text' }],
    structuredContent: value,
  }
}

export const handleMcp = httpAction(async (ctx, request) => {
  const origin = requireAuthOrigin('SITE_URL')
  const issuer = `${origin}/api/auth`
  const resource = `${origin}/mcp`
  let principal
  try {
    principal = await verifyMcpAccessToken(extractBearerToken(request.headers), {
      issuer,
      resource,
    })
  } catch (error) {
    return authorizationFailure(
      origin,
      error instanceof McpTokenError ? error : new McpTokenError('MCP_INVALID_TOKEN'),
    )
  }

  if (request.method !== 'POST') {
    return new Response(null, {
      headers: { allow: 'POST', 'cache-control': 'no-store' },
      status: 405,
    })
  }

  try {
    const message = await readMcpRequest(request)
    if (message.kind === 'initialized') return new Response(null, { status: 202 })
    if (message.kind === 'initialize') {
      return jsonRpcResult(message.id, {
        capabilities: { tools: { listChanged: false } },
        protocolVersion: MCP_PROTOCOL_VERSION,
        serverInfo: { name: 'better-convex-nuxt-mcp-oauth-agent', version: '0.1.0' },
      })
    }
    if (message.kind === 'ping') return jsonRpcResult(message.id, {})
    if (message.kind === 'tools/list') {
      if (!principal.scopes.has('mcp:read')) {
        return authorizationFailure(origin, new McpTokenError('MCP_SCOPE_REQUIRED'), 'mcp:read')
      }
      return jsonRpcResult(message.id, {
        tools: MCP_TOOLS.map(({ requiredScope: _scope, ...tool }) => tool),
      })
    }
    if (!principal.scopes.has(message.requiredScope)) {
      return Response.json(
        { code: 'MCP_SCOPE_REQUIRED' },
        {
          headers: {
            'cache-control': 'no-store',
            'content-type': 'application/json',
            'www-authenticate': challenge(origin, message.requiredScope),
          },
          status: 403,
        },
      )
    }

    const args = message.arguments
    const shared = {
      organizationId: args.organizationId,
      principal: serializePrincipal(principal),
    }
    let result: unknown
    // This switch is the complete dispatch surface. No caller value is ever
    // treated as a Convex function reference.
    switch (message.name) {
      case 'projects.list':
        result = await ctx.runMutation(internal.mcpTools.listProjects, shared)
        break
      case 'projects.create':
        result = await ctx.runMutation(internal.mcpTools.createProject, {
          ...shared,
          name: args.name,
        })
        break
      case 'projects.delete.preview':
        result = await ctx.runMutation(internal.mcpTools.previewProjectDelete, {
          ...shared,
          projectId: args.projectId,
        })
        break
      case 'projects.delete.requestApproval':
        result = await ctx.runMutation(internal.mcpTools.requestProjectDeleteApproval, {
          ...shared,
          projectId: args.projectId,
        })
        break
      case 'projects.delete.execute':
        result = await ctx.runMutation(internal.mcpTools.executeProjectDelete, {
          ...shared,
          approvalId: args.approvalId,
          projectId: args.projectId,
        })
        break
    }
    return jsonRpcResult(message.id, toolResult(result))
  } catch (error) {
    if (error instanceof McpProtocolError) return jsonRpcError(error)
    return applicationFailure(error)
  }
})
