import { createError, getHeader, type H3Event } from 'h3'

const INVALID_BEARER_WINDOW_MS = 60_000
const INVALID_BEARER_LIMIT = 20
const MAX_INVALID_BEARER_KEYS = 1_000
const TRUST_FORWARDED_RATE_LIMIT_HEADERS = false

interface InvalidBearerAttempt {
  count: number
  resetAt: number
}

export const invalidBearerAttempts = new Map<string, InvalidBearerAttempt>()

function pruneExpiredInvalidBearerAttempts(now: number): void {
  for (const [key, attempt] of invalidBearerAttempts) {
    if (attempt.resetAt <= now) invalidBearerAttempts.delete(key)
  }
}

function enforceInvalidBearerKeyCap(): void {
  while (invalidBearerAttempts.size > MAX_INVALID_BEARER_KEYS) {
    const oldestKey = invalidBearerAttempts.keys().next().value
    if (oldestKey === undefined) return
    invalidBearerAttempts.delete(oldestKey)
  }
}

export function getRateLimitKey(event: H3Event): string {
  if (TRUST_FORWARDED_RATE_LIMIT_HEADERS) {
    const forwardedFor = getHeader(event, 'x-forwarded-for')?.split(',')[0]?.trim()
    if (forwardedFor) return forwardedFor
  }

  return event.node.req.socket.remoteAddress || 'unknown'
}

export function assertInvalidBearerBudget(event: H3Event): void {
  const now = Date.now()
  pruneExpiredInvalidBearerAttempts(now)
  const attempt = invalidBearerAttempts.get(getRateLimitKey(event))
  if (!attempt) return
  if (attempt.count >= INVALID_BEARER_LIMIT) {
    throw createError({ statusCode: 429, statusMessage: 'Too many invalid MCP bearer tokens.' })
  }
}

export function recordInvalidBearer(event: H3Event): void {
  const now = Date.now()
  pruneExpiredInvalidBearerAttempts(now)
  const key = getRateLimitKey(event)
  const current = invalidBearerAttempts.get(key)
  if (!current) {
    invalidBearerAttempts.set(key, { count: 1, resetAt: now + INVALID_BEARER_WINDOW_MS })
    enforceInvalidBearerKeyCap()
    return
  }

  current.count += 1
  enforceInvalidBearerKeyCap()
}
