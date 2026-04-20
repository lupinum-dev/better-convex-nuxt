import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  checkToolRateLimit,
  createRedisMcpRateLimitStore,
  parseWindowString,
  RateLimitInfrastructureError,
  ToolRateLimiter,
} from '../../src/runtime/mcp/rate-limiter'

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
    vi.setSystemTime(new Date('2026-04-20T10:00:00.000Z'))
    limiter = new ToolRateLimiter()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows calls under the limit within one fixed window', () => {
    const config = { max: 3, windowMs: 60_000 }
    expect(limiter.check('tool-a', config)).toEqual({ allowed: true })
    expect(limiter.check('tool-a', config)).toEqual({ allowed: true })
    expect(limiter.check('tool-a', config)).toEqual({ allowed: true })
  })

  it('blocks calls over the limit and returns retry-after for the current window', () => {
    const config = { max: 2, windowMs: 60_000 }
    limiter.check('tool-a', config)
    limiter.check('tool-a', config)

    const result = limiter.check('tool-a', config)
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.retryAfterSeconds).toBe(60)
    }
  })

  it('allows again after the fixed window expires', () => {
    const config = { max: 1, windowMs: 60_000 }
    limiter.check('tool-a', config)

    expect(limiter.check('tool-a', config).allowed).toBe(false)

    vi.advanceTimersByTime(60_001)

    expect(limiter.check('tool-a', config)).toEqual({ allowed: true })
  })

  it('tracks buckets independently', () => {
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
})

describe('createRedisMcpRateLimitStore', () => {
  const counters = new Map<string, number>()

  const evalMock = vi.fn(async (_script: string, _numKeys: number, key: string) => {
    const next = (counters.get(key) ?? 0) + 1
    counters.set(key, next)
    return next
  })

  const redisStore = createRedisMcpRateLimitStore({
    client: {
      eval: evalMock,
    },
    keyPrefix: 'trellis:test:rate-limit',
  })

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-20T10:00:00.000Z'))
    counters.clear()
    evalMock.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses a fixed-window redis key and blocks after the configured limit', async () => {
    const config = { bucketKey: 'tool-a:user-1', limit: 2, windowMs: 60_000, now: Date.now() }

    await expect(redisStore.consume(config)).resolves.toMatchObject({
      allowed: true,
      count: 1,
      remaining: 1,
      retryAfterMs: 0,
      windowStartedAt: Date.parse('2026-04-20T10:00:00.000Z'),
    })
    await expect(redisStore.consume(config)).resolves.toMatchObject({
      allowed: true,
      count: 2,
      remaining: 0,
      retryAfterMs: 0,
    })
    await expect(redisStore.consume(config)).resolves.toMatchObject({
      allowed: false,
      count: 3,
      remaining: 0,
      retryAfterMs: 60_000,
    })

    expect(evalMock).toHaveBeenCalledWith(
      expect.stringContaining('redis.call'),
      1,
      `trellis:test:rate-limit:tool-a:user-1:${Date.parse('2026-04-20T10:00:00.000Z')}`,
      60_000,
    )
  })

  it('never allows more than the limit under parallel consume calls', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        redisStore.consume({
          bucketKey: 'parallel:user-1',
          limit: 5,
          windowMs: 60_000,
          now: Date.now(),
        }),
      ),
    )

    expect(results.filter((entry) => entry.allowed)).toHaveLength(5)
    expect(results.filter((entry) => !entry.allowed)).toHaveLength(5)
  })

  it('throws an infrastructure error when redis evaluation fails', async () => {
    evalMock.mockRejectedValueOnce(new Error('redis down'))

    await expect(
      redisStore.consume({
        bucketKey: 'tool-b:user-1',
        limit: 1,
        windowMs: 60_000,
        now: Date.now(),
      }),
    ).rejects.toMatchObject(
      new RateLimitInfrastructureError(
        'Trellis MCP rate-limit Redis consume failed for key prefix "trellis:test:rate-limit".',
      ),
    )
  })

  it('throws an infrastructure error when redis returns a bad counter', async () => {
    evalMock.mockResolvedValueOnce('not-a-number')

    await expect(
      redisStore.consume({
        bucketKey: 'tool-c:user-1',
        limit: 1,
        windowMs: 60_000,
        now: Date.now(),
      }),
    ).rejects.toMatchObject(
      new RateLimitInfrastructureError(
        'Trellis MCP rate-limit Redis consume returned an invalid counter value for key prefix "trellis:test:rate-limit".',
      ),
    )
  })
})

describe('checkToolRateLimit', () => {
  let store: ToolRateLimiter

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-20T10:00:00.000Z'))
    store = new ToolRateLimiter()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses the provided store when present', async () => {
    const config = { max: 2, windowMs: 60_000 }

    await expect(checkToolRateLimit('tool-a:user-1', config, store)).resolves.toEqual({
      allowed: true,
    })
    await expect(checkToolRateLimit('tool-a:user-1', config, store)).resolves.toEqual({
      allowed: true,
    })
    await expect(checkToolRateLimit('tool-a:user-1', config, store)).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 60,
    })
  })

  it('falls back to the process-local limiter when no store is provided', async () => {
    const config = { max: 1, windowMs: 60_000 }

    await expect(checkToolRateLimit('tool-b:user-1', config)).resolves.toEqual({ allowed: true })
    await expect(checkToolRateLimit('tool-b:user-1', config)).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 60,
    })
  })
})
