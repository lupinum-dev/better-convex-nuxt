import { createError, defineEventHandler, getRequestHeader } from 'h3'

import {
  serverConvexQuery,
  serverConvexMutation,
} from '../../../../src/runtime/convex/server/convex'
import { api } from '../../convex/_generated/api'

export default defineEventHandler(async (event) => {
  if (!event.path?.startsWith('/mcp')) return

  const header = getRequestHeader(event, 'authorization')
  if (!header?.startsWith('Bearer ')) return

  const token = header.slice(7).trim()
  if (!token.startsWith('mcp_')) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid MCP bearer token.' })
  }

  try {
    const result = await serverConvexQuery(
      event,
      api.mcpKeys.validate,
      { key: token },
      { auth: 'none' },
    )
    if (!result) {
      throw createError({ statusCode: 401, statusMessage: 'Invalid MCP bearer token.' })
    }

    const auth = {
      keyId: String(result.id),
      role: result.role,
      userId: result.userId,
      ...(result.workspaceId && { workspaceId: result.workspaceId }),
    }
    event.context.mcpAuth = auth
    event.context.__trellisMcpAuth = auth
    await serverConvexMutation(event, api.mcpKeys.touch, { key: token }, { auth: 'none' })
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }
    console.error('[mcp-auth] Key validation failed:', error)
    throw createError({ statusCode: 401, statusMessage: 'Invalid MCP bearer token.' })
  }
})
