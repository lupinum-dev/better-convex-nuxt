/**
 * Simple API-key auth middleware for the MCP endpoint.
 *
 * Reads `Authorization: Bearer <role>:<userId>` and sets event.context.mcpAuth.
 * This is a playground-only demo — real apps would validate JWTs or session tokens.
 *
 * Example keys:
 *   Bearer admin:user-1     → { role: 'admin', userId: 'user-1' }
 *   Bearer member:user-42   → { role: 'member', userId: 'user-42' }
 *   Bearer viewer:user-99   → { role: 'viewer', userId: 'user-99' }
 */
export default defineEventHandler((event) => {
  // Only apply to the MCP route
  if (!event.path?.startsWith('/mcp')) return

  const header = getRequestHeader(event, 'authorization')
  if (!header?.startsWith('Bearer ')) return

  const token = header.slice(7)
  const separatorIndex = token.indexOf(':')
  if (separatorIndex <= 0) return

  const role = token.slice(0, separatorIndex)
  const userId = token.slice(separatorIndex + 1)

  event.context.mcpAuth = { role, userId }
})
