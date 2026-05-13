/**
 * Why this file exists:
 * This is the example's real MCP auth story:
 * - the app UI creates bearer tokens
 * - only a hash is stored in Convex
 * - MCP requests send `Authorization: Bearer mcp_...`
 * - the middleware hashes that token, validates it in Convex, then maps the result to `event.context.mcpAuth`
 */
import { createHash } from 'node:crypto'

import { createError, defineEventHandler, getRequestHeader, type H3Event } from 'h3'

import { api } from '#trellis/api'
import { serverConvexMutation, serverConvexQuery } from '#trellis/server'

const INVALID_BEARER_WINDOW_MS = 60_000
const INVALID_BEARER_LIMIT = 20
const invalidBearerAttempts = new Map<string, { count: number; resetAt: number }>()

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function getRateLimitKey(event: H3Event): string {
  const forwardedFor = getRequestHeader(event, 'x-forwarded-for')?.split(',')[0]?.trim()
  return forwardedFor || event.node.req.socket.remoteAddress || 'unknown'
}

function assertInvalidBearerBudget(event: H3Event): void {
  const now = Date.now()
  const key = getRateLimitKey(event)
  const attempt = invalidBearerAttempts.get(key)
  if (!attempt || attempt.resetAt <= now) return
  if (attempt.count >= INVALID_BEARER_LIMIT) {
    throw createError({ statusCode: 429, statusMessage: 'Too many invalid MCP bearer tokens.' })
  }
}

function recordInvalidBearer(event: H3Event): void {
  const now = Date.now()
  const key = getRateLimitKey(event)
  const current = invalidBearerAttempts.get(key)
  if (!current || current.resetAt <= now) {
    invalidBearerAttempts.set(key, { count: 1, resetAt: now + INVALID_BEARER_WINDOW_MS })
    return
  }
  current.count += 1
}

export default defineEventHandler(async (event) => {
  if (!event.path?.startsWith('/mcp')) return

  const header = getRequestHeader(event, 'authorization')
  if (!header?.startsWith('Bearer ')) {
    if (event.path.startsWith('/mcp/runbook-agent')) {
      throw createError({ statusCode: 401, statusMessage: 'MCP bearer token required.' })
    }
    return
  }

  assertInvalidBearerBudget(event)

  const token = header.slice('Bearer '.length).trim()
  if (!token.startsWith('mcp_')) {
    recordInvalidBearer(event)
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
    recordInvalidBearer(event)
    throw createError({ statusCode: 401, statusMessage: 'Invalid MCP bearer token.' })
  }

  event.context.mcpAuth = {
    keyId: validated.id,
    userId: validated.userId,
    tenantId: validated.tenantId,
  }

  serverConvexMutation(event, api.features.mcpKeys.domain.touch, { hash }, { auth: 'none' }).catch(
    () => {},
  )
})
