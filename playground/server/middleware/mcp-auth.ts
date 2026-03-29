/**
 * Simple API-key auth middleware for the MCP endpoint.
 *
 * Reads `Authorization: Bearer <role>:<userId>` or `Bearer <role>:<userId>:<orgId>`
 * and sets event.context.mcpAuth.
 *
 * This is a playground-only demo — real apps would validate JWTs or session tokens.
 *
 * Example keys:
 *   Bearer admin:user-1           → { role: 'admin', userId: 'user-1' }
 *   Bearer member:user-42         → { role: 'member', userId: 'user-42' }
 *   Bearer admin:user-1:j57abc123 → { role: 'admin', userId: 'user-1', orgId: 'j57abc123' }
 */
export default defineEventHandler((event) => {
  // Only apply to the MCP route
  if (!event.path?.startsWith('/mcp')) return

  const header = getRequestHeader(event, 'authorization')
  if (!header?.startsWith('Bearer ')) return

  const token = header.slice(7)
  const parts = token.split(':')
  if (parts.length < 2 || !parts[0] || !parts[1]) return

  const mcpAuth: Record<string, string> = {
    role: parts[0],
    userId: parts[1],
  }

  // Optional orgId for team-scoped MCP keys
  if (parts[2]) {
    mcpAuth.orgId = parts[2]
  }

  event.context.mcpAuth = mcpAuth
})
