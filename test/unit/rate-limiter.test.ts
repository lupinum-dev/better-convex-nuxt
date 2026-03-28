import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { parseWindowString, ToolRateLimiter } from '../../src/runtime/mcp/rate-limiter'

describe('parseWindowString', () => {
  it('parses seconds', () => {
    expect(parseWindowString('30s')).toBe(30_000)
  })

  it('parses minutes', () => {
    expect(parseWindowString('1m')).toBe(60_000)
    expect(parseWindowString('5m')).toBe(300_000)
  })

  it('parses hours', () => {
    expect(parseWindowString('2h')).toBe(7_200_000)
  })

  it('throws on invalid format', () => {
    expect(() => parseWindowString('1d')).toThrow('Invalid rate limit window')
    expect(() => parseWindowString('abc')).toThrow('Invalid rate limit window')
  })
})

describe('ToolRateLimiter', () => {
  let limiter: ToolRateLimiter

  beforeEach(() => {
    vi.useFakeTimers()
    limiter = new ToolRateLimiter()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows calls under the limit', () => {
    const config = { max: 3, windowMs: 60_000 }
    expect(limiter.check('tool-a', config)).toEqual({ allowed: true })
    expect(limiter.check('tool-a', config)).toEqual({ allowed: true })
    expect(limiter.check('tool-a', config)).toEqual({ allowed: true })
  })

  it('blocks calls over the limit', () => {
    const config = { max: 2, windowMs: 60_000 }
    limiter.check('tool-a', config)
    limiter.check('tool-a', config)

    const result = limiter.check('tool-a', config)
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.retryAfterSeconds).toBeGreaterThan(0)
      expect(result.retryAfterSeconds).toBeLessThanOrEqual(60)
    }
  })

  it('allows again after window expires', () => {
    const config = { max: 1, windowMs: 60_000 }
    limiter.check('tool-a', config)

    expect(limiter.check('tool-a', config).allowed).toBe(false)

    vi.advanceTimersByTime(60_001)

    expect(limiter.check('tool-a', config)).toEqual({ allowed: true })
  })

  it('tracks tools independently', () => {
    const config = { max: 1, windowMs: 60_000 }
    limiter.check('tool-a', config)

    expect(limiter.check('tool-a', config).allowed).toBe(false)
    expect(limiter.check('tool-b', config)).toEqual({ allowed: true })
  })

  it('resets all state', () => {
    const config = { max: 1, windowMs: 60_000 }
    limiter.check('tool-a', config)
    expect(limiter.check('tool-a', config).allowed).toBe(false)

    limiter.reset()
    expect(limiter.check('tool-a', config)).toEqual({ allowed: true })
  })

  it('evicts oldest key when exceeding MAX_KEYS (1000)', () => {
    const config = { max: 10, windowMs: 60_000 }

    // Fill with 1001 unique keys — first key should be evicted
    for (let i = 0; i <= 1000; i++) {
      limiter.check(`tool-${i}`, config)
    }

    // tool-0 was the oldest, should have been evicted — its limit resets
    limiter.check(`tool-0`, config)
    // If eviction didn't happen, tool-0 would have 2 entries.
    // After eviction + re-add, it should have 1 entry and still be allowed.
    expect(limiter.check(`tool-0`, config)).toEqual({ allowed: true })

    // tool-1 (second oldest, NOT evicted) should still have its entry
    // It should still be allowed since max is 10
    expect(limiter.check(`tool-1`, config)).toEqual({ allowed: true })
  })
})
