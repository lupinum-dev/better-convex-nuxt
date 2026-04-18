import { api } from '#trellis/api'
/**
 * Why this file exists:
 * The example needs a tiny way to authenticate MCP requests without teaching API key issuance too.
 * `Authorization: Bearer demo:<email>` is intentionally demo-only and should not be copied to production.
 */
import { serverConvexQuery } from '#trellis/server'

export default defineEventHandler(async (event) => {
  if (!event.path?.startsWith('/mcp')) return

  const header = getRequestHeader(event, 'authorization')
  if (!header?.startsWith('Bearer demo:')) return

  const email = header.slice('Bearer demo:'.length).trim()
  if (!email) return

  const user = await serverConvexQuery(
    event,
    api.domain.users.resolveMcpUserByEmail,
    { email },
    { auth: 'none' },
  )

  if (user) {
    event.context.mcpAuth = user
  }
})
