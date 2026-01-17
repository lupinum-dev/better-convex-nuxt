/**
 * Simple two-level logger for better-convex-nuxt
 *
 * Levels:
 * - false: No logs (production default)
 * - 'info': Simple logs for everyday use
 * - 'debug': Detailed logs with timing for deep debugging sessions
 */

export type LogLevel = false | 'info' | 'debug'

export interface Logger {
  /** Info-level log - everyday use */
  info(message: string, data?: unknown): void
  /** Warning log */
  warn(message: string): void
  /** Error log */
  error(message: string, err?: Error): void
  /** Debug-level log - only shown when level is 'debug' */
  debug(message: string, data?: unknown): void
  /** Timing helper - returns function to log elapsed time */
  time(label: string): () => void
}

/** No-op logger for when logging is disabled */
const noopLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  time: () => () => {},
}

const PREFIX = '[convex]'

/**
 * Format data for logging - handles objects, arrays, etc.
 */
function formatData(data: unknown): string {
  if (data === undefined || data === null) return ''
  if (typeof data === 'string') return data
  if (typeof data === 'number' || typeof data === 'boolean') return String(data)
  try {
    return JSON.stringify(data)
  } catch {
    return String(data)
  }
}

/**
 * Create a logger with the specified level.
 */
export function createLogger(level: LogLevel): Logger {
  if (!level) return noopLogger

  const isDebug = level === 'debug'

  return {
    info: (msg, data?) => {
      if (data !== undefined) {
        console.log(`${PREFIX} ${msg}`, formatData(data))
      } else {
        console.log(`${PREFIX} ${msg}`)
      }
    },
    warn: (msg) => console.warn(`${PREFIX} ${msg}`),
    error: (msg, err) => {
      if (err) {
        console.error(`${PREFIX} ${msg}`, err)
      } else {
        console.error(`${PREFIX} ${msg}`)
      }
    },
    debug: (msg, data) => {
      if (isDebug) {
        if (data !== undefined) {
          console.log(`${PREFIX} [debug] ${msg}`, formatData(data))
        } else {
          console.log(`${PREFIX} [debug] ${msg}`)
        }
      }
    },
    time: (label) => {
      if (!isDebug) return () => {}
      const start = performance.now()
      return () => {
        const elapsed = Math.round(performance.now() - start)
        console.log(`${PREFIX} [time] ${label}: ${elapsed}ms`)
      }
    },
  }
}

/**
 * Get log level from runtime config.
 */
export function getLogLevel(config: Record<string, unknown>): LogLevel {
  const logging = config.logging as LogLevel | undefined
  return logging ?? false
}

