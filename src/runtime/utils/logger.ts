/**
 * Simple two-level logger for better-convex-nuxt
 *
 * Levels:
 * - false: No logs (production default)
 * - 'info': Simple logs for everyday use
 * - 'debug': Detailed logs with timing for deep debugging sessions
 */

import { createConsola, type ConsolaInstance } from 'consola'

export type LogLevel = false | 'info' | 'debug'

export interface Logger {
  /** Info-level log - everyday use */
  info(message: string): void
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

/**
 * Create a logger with the specified level.
 */
export function createLogger(level: LogLevel): Logger {
  if (!level) return noopLogger

  const isDebug = level === 'debug'

  const consola: ConsolaInstance = createConsola({
    level: isDebug ? 4 : 3, // 4 = debug, 3 = info
  }).withTag('convex')

  return {
    info: (msg) => consola.info(msg),
    warn: (msg) => consola.warn(msg),
    error: (msg, err) => {
      if (err) {
        consola.error(msg, err)
      } else {
        consola.error(msg)
      }
    },
    debug: (msg, data) => {
      if (isDebug) {
        if (data !== undefined) {
          consola.debug(msg, data)
        } else {
          consola.debug(msg)
        }
      }
    },
    time: (label) => {
      if (!isDebug) return () => {}
      const start = performance.now()
      return () => {
        const elapsed = Math.round(performance.now() - start)
        consola.debug(`${label}: ${elapsed}ms`)
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

