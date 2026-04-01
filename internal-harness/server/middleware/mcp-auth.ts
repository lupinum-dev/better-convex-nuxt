/**
 * MCP auth middleware — validates bearer tokens against the mcpKeys table.
 *
 * Reads `Authorization: Bearer <mcp_key>` and looks up the key in Convex.
 * If valid, sets event.context.mcpAuth with { role, userId, tenantId }.
 *
 * Also supports the legacy format `Bearer <role>:<userId>:<tenantId?>` for
 * quick testing without creating a key in the database.
 */
import { serverConvexQuery, serverConvexMutation } from '../../../src/runtime/server/utils/convex'
import { api } from '../../convex/_generated/api'

export default defineEventHandler(async (event) => {
  // Only apply to the MCP route
  if (!event.path?.startsWith('/mcp')) return

  const header = getRequestHeader(event, 'authorization')
  if (!header?.startsWith('Bearer ')) return

  const token = header.slice(7)

  // ── Database key lookup (mcp_* prefix) ──────────────────────────────
  if (token.startsWith('mcp_')) {
    try {
      const result = await serverConvexQuery(event, api.mcpKeys.validate, { key: token })
      if (result) {
        event.context.mcpAuth = {
          role: result.role,
          userId: result.userId,
          ...(result.tenantId && { tenantId: result.tenantId }),
        }
        // Fire-and-forget: update lastUsedAt
        serverConvexMutation(event, api.mcpKeys.touch, { key: token }).catch(() => {})
      }
    } catch (e) {
      console.error('[mcp-auth] Key validation failed:', e)
    }
    return
  }

  // ── Legacy format: role:userId:tenantId? ────────────────────────────
  const parts = token.split(':')
  if (parts.length < 2 || !parts[0] || !parts[1]) return

  const mcpAuth: Record<string, string> = {
    role: parts[0],
    userId: parts[1],
  }

  if (parts[2]) {
    mcpAuth.tenantId = parts[2]
  }

  event.context.mcpAuth = mcpAuth
})
