/**
 * Why this file exists:
 * This is the example's real MCP auth story:
 * - the app UI creates bearer tokens
 * - only a hash is stored in Convex
 * - MCP requests send `Authorization: Bearer mcp_...`
 * - the middleware hashes that token, validates it in Convex, then maps the result to `event.context.mcpAuth`
 */
import { createHash } from 'node:crypto'

import { api } from '#trellis/api'
import { serverConvexMutation, serverConvexQuery } from '#trellis/server'

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export default defineEventHandler(async (event) => {
  if (!event.path?.startsWith('/mcp')) return

  const header = getRequestHeader(event, 'authorization')
  if (!header?.startsWith('Bearer ')) return

  const token = header.slice('Bearer '.length).trim()
  if (!token.startsWith('mcp_')) return

  const validated = await serverConvexQuery(
    event,
    api.mcpKeys.validate,
    { hash: hashToken(token) },
    { auth: 'none' },
  )

  if (!validated) return

  event.context.mcpAuth = {
    keyId: validated.id,
    userId: validated.userId,
  }

  serverConvexMutation(
    event,
    api.mcpKeys.touch,
    { id: validated.id, seenAt: Date.now() },
    { auth: 'none' },
  ).catch(() => {})
})
