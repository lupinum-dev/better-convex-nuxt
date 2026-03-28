const UNIT_MS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
}

/**
 * Parse a duration string like '1m', '30s', '2h' into milliseconds.
 */
export function parseWindowString(window: string): number {
  const match = window.match(/^(\d+)\s*([smh])$/)
  if (!match) throw new Error(`Invalid rate limit window: "${window}". Use format like "1m", "30s", "2h".`)
  return Number(match[1]) * UNIT_MS[match[2]!]!
}

/**
 * Simple in-memory sliding-window rate limiter keyed by tool name.
 */
export class ToolRateLimiter {
  private windows = new Map<string, number[]>()

  check(
    toolName: string,
    config: { max: number; windowMs: number },
  ): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
    const now = Date.now()
    const cutoff = now - config.windowMs

    let timestamps = this.windows.get(toolName)
    if (!timestamps) {
      timestamps = []
      this.windows.set(toolName, timestamps)
    }

    // Prune expired entries
    while (timestamps.length > 0 && timestamps[0]! < cutoff) {
      timestamps.shift()
    }

    if (timestamps.length >= config.max) {
      const oldestInWindow = timestamps[0]!
      const retryAfterMs = oldestInWindow + config.windowMs - now
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
      }
    }

    timestamps.push(now)
    return { allowed: true }
  }

  /** Reset all state (for testing). */
  reset(): void {
    this.windows.clear()
  }
}

/** Shared singleton instance. */
export const globalRateLimiter = new ToolRateLimiter()
