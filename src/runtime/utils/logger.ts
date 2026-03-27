/**
 * Semantic logger for better-convex-nuxt
 *
 * Levels:
 * - false: No logs (production default)
 * - 'info': Auth, mutations, actions, uploads, connection events
 * - 'debug': All above + query updates, timing, debug messages
 *
 * Uses consola for environment-aware output formatting.
 */

import { createConsola, type ConsolaInstance } from 'consola'

export type LogLevel = false | 'info' | 'debug'

// ============================================================================
// Event Types
// ============================================================================

export interface AuthEvent {
  phase: string // 'session-check', 'cache', 'exchange', 'hydrate', 'login', 'logout'
  outcome: 'success' | 'error' | 'skip' | 'miss'
  details?: Record<string, unknown> // user, duration, cache status, etc.
  error?: Error
}

export interface QueryEvent {
  name: string
  event: 'subscribe' | 'update' | 'unsubscribe' | 'error' | 'share'
  count?: number // item count for updates
  refCount?: number // for subscription sharing
  args?: unknown
  data?: unknown // only logged in debug mode
  error?: Error
}

export interface MutationEvent {
  name: string
  event: 'optimistic' | 'success' | 'error'
  args?: unknown
  duration?: number
  error?: Error
}

export interface ActionEvent {
  name: string
  event: 'success' | 'error'
  duration?: number
  error?: Error
}

export interface ConnectionEvent {
  event: 'lost' | 'restored'
  offlineDuration?: number // ms offline (for 'restored')
}

export interface UploadEvent {
  name: string // function name
  event: 'success' | 'error'
  filename?: string
  size?: number // bytes
  duration?: number
  error?: Error | string
}

// ============================================================================
// Logger Interface
// ============================================================================

export interface Logger {
  auth(event: AuthEvent): void
  query(event: QueryEvent): void
  mutation(event: MutationEvent): void
  action(event: ActionEvent): void
  connection(event: ConnectionEvent): void
  upload(event: UploadEvent): void
  debug(message: string, data?: unknown): void
  time(label: string): () => void
}

// ============================================================================
// No-op Logger
// ============================================================================

const noopLogger: Logger = {
  auth: () => {},
  query: () => {},
  mutation: () => {},
  action: () => {},
  connection: () => {},
  upload: () => {},
  debug: () => {},
  time: () => () => {},
}

// ============================================================================
// Consola-based Logger
// ============================================================================

function formatDuration(ms: number): string {
  return `${ms}ms`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function createConsolaLogger(level: 'info' | 'debug'): Logger {
  const isDebug = level === 'debug'

  const consola: ConsolaInstance = createConsola({
    level: isDebug ? 4 : 3, // 4 = debug, 3 = info
  }).withTag('convex')

  const auth = consola.withTag('auth')
  const query = consola.withTag('query')
  const mutation = consola.withTag('mutation')
  const action = consola.withTag('action')
  const connection = consola.withTag('connection')
  const upload = consola.withTag('upload')

  return {
    auth(event: AuthEvent): void {
      const msg = event.details
        ? `${event.phase} [${event.outcome}] ${Object.entries(event.details).map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`).join(' ')}`
        : `${event.phase} [${event.outcome}]`

      if (event.error) {
        auth.error(msg, event.error)
      } else if (event.outcome === 'error') {
        auth.error(msg)
      } else {
        auth.info(msg)
      }
    },

    query(event: QueryEvent): void {
      if (!isDebug) return

      let msg = event.name
      switch (event.event) {
        case 'subscribe':
          msg += ' subscribe'
          break
        case 'update':
          msg += event.count !== undefined ? ` update (${event.count} items)` : ' update'
          break
        case 'unsubscribe':
          msg += ' unsubscribe'
          break
        case 'share':
          msg += ` share (refCount: ${event.refCount})`
          break
        case 'error':
          msg += ' error'
          break
      }

      if (event.error) {
        query.error(msg, event.error)
      } else {
        query.debug(msg)
      }
    },

    mutation(event: MutationEvent): void {
      let msg = event.name
      if (event.event === 'optimistic') {
        msg += ' optimistic'
      } else if (event.event === 'success') {
        msg += event.duration !== undefined ? ` success ${formatDuration(event.duration)}` : ' success'
      } else {
        msg += ' error'
      }

      if (event.error) {
        mutation.error(msg, event.error)
      } else {
        mutation.info(msg)
      }
    },

    action(event: ActionEvent): void {
      let msg = event.name
      if (event.event === 'success') {
        msg += event.duration !== undefined ? ` success ${formatDuration(event.duration)}` : ' success'
      } else {
        msg += ' error'
      }

      if (event.error) {
        action.error(msg, event.error)
      } else {
        action.info(msg)
      }
    },

    connection(event: ConnectionEvent): void {
      if (event.event === 'lost') {
        connection.warn('Connection lost')
      } else {
        const msg = event.offlineDuration !== undefined
          ? `Connection restored (offline ${formatDuration(event.offlineDuration)})`
          : 'Connection restored'
        connection.info(msg)
      }
    },

    upload(event: UploadEvent): void {
      let msg = event.name
      if (event.event === 'success') {
        const parts = [event.filename, event.size !== undefined ? formatBytes(event.size) : null, event.duration !== undefined ? formatDuration(event.duration) : null].filter(Boolean)
        msg += ` success${parts.length ? ` ${parts.join(' ')}` : ''}`
      } else {
        const errMsg = event.error ? (typeof event.error === 'string' ? event.error : event.error.message) : ''
        msg += ` error${errMsg ? ` ${errMsg}` : ''}`
      }

      if (event.event === 'error') {
        upload.error(msg)
      } else {
        upload.info(msg)
      }
    },

    debug(message: string, data?: unknown): void {
      if (!isDebug) return
      if (data !== undefined) {
        consola.debug(message, data)
      } else {
        consola.debug(message)
      }
    },

    time(label: string): () => void {
      if (!isDebug) return () => {}
      const start = performance.now()
      return () => {
        const elapsed = Math.round(performance.now() - start)
        consola.debug(`${label}: ${elapsed}ms`)
      }
    },
  }
}

// ============================================================================
// Factory & Cache
// ============================================================================

/**
 * Create a logger with the specified level.
 */
export function createLogger(level: LogLevel): Logger {
  if (!level) return noopLogger
  return createConsolaLogger(level)
}

const sharedLoggers = new Map<Exclude<LogLevel, false>, Logger>()

/**
 * Shared logger cache for hot composable paths.
 */
export function getSharedLogger(level: LogLevel): Logger {
  if (!level) return noopLogger
  const typedLevel = level as Exclude<LogLevel, false>
  const existing = sharedLoggers.get(typedLevel)
  if (existing) return existing

  const logger = createLogger(level)
  sharedLoggers.set(typedLevel, logger)
  return logger
}

/**
 * Get log level from runtime config.
 */
export function getLogLevel(config: unknown): LogLevel {
  const logging = (
    config && typeof config === 'object' && 'logging' in config
      ? (config as { logging?: LogLevel }).logging
      : undefined
  ) as LogLevel | undefined
  return logging ?? false
}
