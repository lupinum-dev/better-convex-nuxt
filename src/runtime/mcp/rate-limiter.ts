const UNIT_MS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
}

const REDIS_FIXED_WINDOW_CONSUME_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return count
`.trim()

type RateLimitState = {
  windowStartedAt: number
  count: number
}

export interface McpRateLimitConsumeInput {
  bucketKey: string
  limit: number
  windowMs: number
  now: number
}

export interface McpRateLimitCheck {
  allowed: boolean
  count: number
  remaining: number
  retryAfterMs: number
  windowStartedAt: number
}

export interface McpRateLimitStore {
  consume(input: McpRateLimitConsumeInput): Promise<McpRateLimitCheck>
}

export interface RedisEvalLike {
  eval(
    script: string,
    numKeys: number,
    ...args: Array<string | number>
  ): Promise<number | string | null>
}

export interface CreateRedisMcpRateLimitStoreOptions {
  client: RedisEvalLike
  keyPrefix?: string
}

export class RateLimitInfrastructureError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message)
    this.name = 'RateLimitInfrastructureError'
    if (options?.cause !== undefined) {
      ;(this as Error & { cause?: unknown }).cause = options.cause
    }
  }
}

/**
 * Parse a duration string like '1m', '30s', '2h' into milliseconds.
 */
export function parseWindowString(window: string): number {
  const match = window.match(/^(\d+)\s*([smh])$/)
  if (!match)
    throw new Error(`Invalid rate limit window: "${window}". Use format like "1m", "30s", "2h".`)
  return Number(match[1]) * UNIT_MS[match[2]!]!
}

function toRetryAfterMs(windowStartedAt: number, windowMs: number, now: number): number {
  return Math.max(0, windowStartedAt + windowMs - now)
}

function toCheckResult(
  count: number,
  limit: number,
  windowStartedAt: number,
  windowMs: number,
  now: number,
): McpRateLimitCheck {
  return {
    allowed: count <= limit,
    count,
    remaining: Math.max(limit - count, 0),
    retryAfterMs: count <= limit ? 0 : toRetryAfterMs(windowStartedAt, windowMs, now),
    windowStartedAt,
  }
}

function toLegacyCheckResult(
  result: McpRateLimitCheck,
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  if (result.allowed) {
    return { allowed: true }
  }

  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil(result.retryAfterMs / 1000)),
  }
}

function currentWindowStart(now: number, windowMs: number): number {
  return Math.floor(now / windowMs) * windowMs
}

function redisKey(prefix: string, bucketKey: string, windowStartedAt: number): string {
  return `${prefix}:${bucketKey}:${windowStartedAt}`
}

/**
 * Fixed-window in-memory limiter keyed by tool/caller bucket.
 */
export class ToolRateLimiter implements McpRateLimitStore {
  private windows = new Map<string, RateLimitState>()

  check(
    bucket: string,
    config: { max: number; windowMs: number },
    now = Date.now(),
  ): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
    return toLegacyCheckResult(
      this.consumeSync({
        bucketKey: bucket,
        limit: config.max,
        windowMs: config.windowMs,
        now,
      }),
    )
  }

  async consume(input: McpRateLimitConsumeInput): Promise<McpRateLimitCheck> {
    return this.consumeSync(input)
  }

  private consumeSync(input: McpRateLimitConsumeInput): McpRateLimitCheck {
    const windowStartedAt = currentWindowStart(input.now, input.windowMs)
    const current = this.windows.get(input.bucketKey)

    if (!current || current.windowStartedAt !== windowStartedAt) {
      const nextState = {
        windowStartedAt,
        count: 1,
      }
      this.windows.set(input.bucketKey, nextState)
      return toCheckResult(nextState.count, input.limit, windowStartedAt, input.windowMs, input.now)
    }

    current.count += 1
    return toCheckResult(current.count, input.limit, windowStartedAt, input.windowMs, input.now)
  }

  reset(): void {
    this.windows.clear()
  }
}

const processLocalRateLimiter = new ToolRateLimiter()

export function createRedisMcpRateLimitStore(
  options: CreateRedisMcpRateLimitStoreOptions,
): McpRateLimitStore {
  const keyPrefix = options.keyPrefix?.trim() || 'trellis:mcp:rate-limit'

  return {
    consume: async (input) => {
      const windowStartedAt = currentWindowStart(input.now, input.windowMs)
      const key = redisKey(keyPrefix, input.bucketKey, windowStartedAt)

      let rawCount: number | string | null
      try {
        rawCount = await options.client.eval(
          REDIS_FIXED_WINDOW_CONSUME_SCRIPT,
          1,
          key,
          input.windowMs,
        )
      } catch (error) {
        throw new RateLimitInfrastructureError(
          `Trellis MCP rate-limit Redis consume failed for key prefix "${keyPrefix}".`,
          { cause: error },
        )
      }

      const count = typeof rawCount === 'number' ? rawCount : Number(rawCount)
      if (!Number.isFinite(count) || count < 1) {
        throw new RateLimitInfrastructureError(
          `Trellis MCP rate-limit Redis consume returned an invalid counter value for key prefix "${keyPrefix}".`,
        )
      }

      return toCheckResult(count, input.limit, windowStartedAt, input.windowMs, input.now)
    },
  }
}

export async function checkToolRateLimit(
  bucket: string,
  config: { max: number; windowMs: number },
  store?: McpRateLimitStore,
): Promise<{ allowed: true } | { allowed: false; retryAfterSeconds: number }> {
  const result = store
    ? await store.consume({
        bucketKey: bucket,
        limit: config.max,
        windowMs: config.windowMs,
        now: Date.now(),
      })
    : await processLocalRateLimiter.consume({
        bucketKey: bucket,
        limit: config.max,
        windowMs: config.windowMs,
        now: Date.now(),
      })

  return toLegacyCheckResult(result)
}
