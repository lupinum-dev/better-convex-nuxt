/**
 * Why this file exists:
 * The example needs a tiny way to authenticate MCP requests without teaching API key issuance too.
 * `Authorization: Bearer demo:<email>` is intentionally demo-only and should not be copied to production.
 */
import { serverConvexQuery } from '#convex/server'
import { api } from '~/convex/_generated/api'

export default defineEventHandler(async (event) => {
  if (!event.path?.startsWith('/mcp')) return

  const header = getRequestHeader(event, 'authorization')
  if (!header?.startsWith('Bearer demo:')) return

  const email = header.slice('Bearer demo:'.length).trim()
  if (!email) return

  const actor = await serverConvexQuery(
    event,
    api.users.resolveMcpActorByEmail,
    { email },
    { auth: 'none' },
  )

  if (actor) {
    event.context.mcpAuth = actor
  }
})
