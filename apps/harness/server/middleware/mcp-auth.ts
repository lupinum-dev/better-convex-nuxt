import {
  serverConvexQuery,
  serverConvexMutation,
} from '../../../../src/runtime/server/utils/convex'
import { api } from '../../convex/_generated/api'

export default defineEventHandler(async (event) => {
  if (!event.path?.startsWith('/mcp')) return

  const header = getRequestHeader(event, 'authorization')
  if (!header?.startsWith('Bearer ')) return

  const token = header.slice(7)

  if (!token.startsWith('mcp_')) {
    return
  }

  try {
    const result = await serverConvexQuery(
      event,
      api.mcpKeys.validate,
      { key: token },
      { auth: 'none' },
    )
    if (!result) return

    const auth = {
      role: result.role,
      userId: result.userId,
      ...(result.tenantId && { tenantId: result.tenantId }),
    }
    event.context.mcpAuth = auth
    event.context.__trellisMcpAuth = auth
    await serverConvexMutation(event, api.mcpKeys.touch, { key: token }, { auth: 'none' })
  } catch (error) {
    console.error('[mcp-auth] Key validation failed:', error)
  }
})
