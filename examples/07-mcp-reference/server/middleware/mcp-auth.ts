/**
 * Why this file exists:
 * This is the example's real MCP auth story:
 * - the app UI creates bearer tokens
 * - only a hash is stored in Convex
 * - MCP requests send `Authorization: Bearer mcp_...`
 * - the middleware hashes that token, validates it in Convex, then maps the result to `event.context.mcpAuth`
 */
import { createHash } from 'node:crypto'

import { createError, defineEventHandler, getRequestHeader } from 'h3'

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
  if (!token.startsWith('mcp_')) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid MCP bearer token.' })
  }

  const hash = hashToken(token)

  const validated = await serverConvexQuery(
    event,
    api.features.mcpKeys.domain.validate,
    { hash },
    { auth: 'none' },
  )

  if (!validated) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid MCP bearer token.' })
  }

  event.context.mcpAuth = {
    keyId: validated.id,
    userId: validated.userId,
    tenantId: validated.tenantId,
  }

  serverConvexMutation(
    event,
    api.features.mcpKeys.domain.touch,
    { hash, seenAt: Date.now() },
    { auth: 'none' },
  ).catch(() => {})
})
