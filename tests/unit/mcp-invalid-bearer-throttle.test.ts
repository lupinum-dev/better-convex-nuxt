import { readFileSync } from 'node:fs'

import type { H3Event } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  assertInvalidBearerBudget as assertExampleBudget,
  getRateLimitKey as getExampleRateLimitKey,
  invalidBearerAttempts as exampleAttempts,
  recordInvalidBearer as recordExampleInvalidBearer,
} from '../../examples/07-mcp-reference/server/lib/mcp-invalid-bearer-throttle'

function createEvent(remoteAddress: string, headers: Record<string, string> = {}): H3Event {
  return {
    node: {
      req: {
        headers,
        socket: { remoteAddress },
      },
    },
  } as unknown as H3Event
}

describe('MCP invalid bearer throttles', () => {
  afterEach(() => {
    vi.useRealTimers()
    exampleAttempts.clear()
  })

  it('rejects over-budget invalid bearer attempts before Convex validation', () => {
    const event = createEvent('127.0.0.1')

    for (let index = 0; index < 20; index += 1) {
      recordExampleInvalidBearer(event)
    }

    expect(() => assertExampleBudget(event)).toThrow(/Too many invalid MCP bearer tokens/)
  })

  it('prunes expired attempts on budget checks', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-12T00:00:00.000Z'))
    const event = createEvent('127.0.0.2')

    recordExampleInvalidBearer(event)
    expect(exampleAttempts.size).toBe(1)

    vi.setSystemTime(new Date('2026-05-12T00:01:01.000Z'))
    expect(() => assertExampleBudget(event)).not.toThrow()
    expect(exampleAttempts.size).toBe(0)
  })

  it('caps stored keys under spoofed unique remotes', () => {
    for (let index = 0; index < 1_050; index += 1) {
      recordExampleInvalidBearer(createEvent(`127.0.1.${index}`))
    }

    expect(exampleAttempts.size).toBe(1_000)
  })

  it('uses the socket remote address instead of forwarded headers by default', () => {
    const event = createEvent('127.0.0.3', {
      'x-forwarded-for': '203.0.113.10, 203.0.113.11',
    })

    expect(getExampleRateLimitKey(event)).toBe('127.0.0.3')
  })

  it('keeps the starter fixture on the same bounded throttle policy', () => {
    const source = readFileSync(
      new URL(
        '../../src/cli/starter-fixtures/workspace-mcp/server/lib/mcp-invalid-bearer-throttle.ts',
        import.meta.url,
      ),
      'utf8',
    )

    expect(source).toContain('const MAX_INVALID_BEARER_KEYS = 1_000')
    expect(source).toContain('const TRUST_FORWARDED_RATE_LIMIT_HEADERS = false')
    expect(source).toContain('pruneExpiredInvalidBearerAttempts(now)')
    expect(source).toContain('enforceInvalidBearerKeyCap()')
    expect(source).toContain("event.node.req.socket.remoteAddress || 'unknown'")
  })
})
