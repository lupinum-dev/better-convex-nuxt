/**
 * Semantic logger for better-convex-nuxt
 *
 * Levels:
 * - false: No logs (production default)
 * - 'info': Auth, mutations, actions, uploads, connection events
 * - 'debug': All above + query updates, timing, debug messages
 *
 * Output:
 * - Server: ANSI-styled single-line logs for easy grep/scanning
 * - Browser: CSS badges + collapsed groups for clean dev tools
 */

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
  // Semantic methods - primary API
  auth(event: AuthEvent): void
  query(event: QueryEvent): void
  mutation(event: MutationEvent): void
  action(event: ActionEvent): void
  connection(event: ConnectionEvent): void
  upload(event: UploadEvent): void

  // Generic fallback for edge cases
  debug(message: string, data?: unknown): void

  // Timing helper
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
// ANSI Colors (Server)
// ============================================================================

const ANSI = {
  reset: '\x1B[0m',
  dim: '\x1B[2m',
  cyan: '\x1B[36m',
  green: '\x1B[32m',
  yellow: '\x1B[33m',
  red: '\x1B[31m',
  magenta: '\x1B[35m',
}

// ============================================================================
// Icons
// ============================================================================

const ICONS = {
  success: '✔',
  error: '✖',
  warning: '⚠',
  query: '📡',
  mutation: '🚀',
  action: '⚡',
  upload: '📤',
}

// ============================================================================
// CSS Badges (Browser)
// ============================================================================

const CSS = {
  badge: 'background: #6366f1; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
  success: 'color: #22c55e; font-weight: bold;',
  error: 'color: #ef4444; font-weight: bold;',
  warning: 'color: #f59e0b; font-weight: bold;',
  dim: 'color: #9ca3af;',
  name: 'color: #3b82f6; font-weight: bold;',
}

// ============================================================================
// Helpers
// ============================================================================

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function formatDuration(ms: number): string {
  return `${ms}ms`
}

function formatDetails(details: Record<string, unknown>): string {
  return Object.entries(details)
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(' ')
}

// ============================================================================
// Server Logger (ANSI)
// ============================================================================

function createServerLogger(level: 'info' | 'debug'): Logger {
  const isDebug = level === 'debug'
  const PREFIX = `${ANSI.cyan}[convex]${ANSI.reset}`

  return {
    auth(event: AuthEvent): void {
      const icon =
        event.outcome === 'success'
          ? `${ANSI.green}${ICONS.success}${ANSI.reset}`
          : event.outcome === 'error'
            ? `${ANSI.red}${ICONS.error}${ANSI.reset}`
            : `${ANSI.yellow}${ICONS.warning}${ANSI.reset}`

      let msg = `${PREFIX} ${icon} Auth:${event.phase}`

      if (event.details) {
        msg += `  ${ANSI.dim}${formatDetails(event.details)}${ANSI.reset}`
      }

      if (event.error) {
        console.error(msg, event.error)
      } else {
        console.log(msg)
      }
    },

    query(event: QueryEvent): void {
      // Queries are debug-only (too noisy for info)
      if (!isDebug) return

      const icon = event.event === 'error' ? `${ANSI.red}${ICONS.error}${ANSI.reset}` : ICONS.query
      let msg = `${PREFIX} ${icon} ${event.name}`

      switch (event.event) {
        case 'subscribe':
          msg += `  ${ANSI.dim}subscribe${ANSI.reset}`
          break
        case 'update':
          msg += `  ${ANSI.dim}update${event.count !== undefined ? ` (${event.count} items)` : ''}${ANSI.reset}`
          break
        case 'unsubscribe':
          msg += `  ${ANSI.dim}unsubscribe${ANSI.reset}`
          break
        case 'share':
          msg += `  ${ANSI.dim}share (refCount: ${event.refCount})${ANSI.reset}`
          break
        case 'error':
          msg += `  ${ANSI.red}error${ANSI.reset}`
          break
      }

      if (event.error) {
        console.error(msg, event.error)
      } else {
        console.log(msg)
      }
    },

    mutation(event: MutationEvent): void {
      const icon =
        event.event === 'error'
          ? `${ANSI.red}${ICONS.error}${ANSI.reset}`
          : `${ANSI.green}${ICONS.mutation}${ANSI.reset}`

      let msg = `${PREFIX} ${icon} ${event.name}`

      if (event.event === 'optimistic') {
        msg += `  ${ANSI.magenta}optimistic${ANSI.reset}`
      } else if (event.event === 'success') {
        msg += `  ${ANSI.green}success${ANSI.reset}`
        if (event.duration !== undefined) {
          msg += ` ${ANSI.dim}${formatDuration(event.duration)}${ANSI.reset}`
        }
      } else {
        msg += `  ${ANSI.red}error${ANSI.reset}`
      }

      // Show args only in debug mode
      if (isDebug && event.args !== undefined) {
        console.log(msg, event.args)
      } else if (event.error) {
        console.error(msg, event.error)
      } else {
        console.log(msg)
      }
    },

    action(event: ActionEvent): void {
      const icon =
        event.event === 'error'
          ? `${ANSI.red}${ICONS.error}${ANSI.reset}`
          : `${ANSI.green}${ICONS.action}${ANSI.reset}`

      let msg = `${PREFIX} ${icon} ${event.name}`

      if (event.event === 'success') {
        msg += `  ${ANSI.green}success${ANSI.reset}`
        if (event.duration !== undefined) {
          msg += ` ${ANSI.dim}${formatDuration(event.duration)}${ANSI.reset}`
        }
      } else {
        msg += `  ${ANSI.red}error${ANSI.reset}`
      }

      if (event.error) {
        console.error(msg, event.error)
      } else {
        console.log(msg)
      }
    },

    connection(event: ConnectionEvent): void {
      if (event.event === 'lost') {
        console.log(`${PREFIX} ${ANSI.yellow}${ICONS.warning}${ANSI.reset} Connection  ${ANSI.yellow}lost${ANSI.reset}`)
      } else {
        let msg = `${PREFIX} ${ANSI.green}${ICONS.success}${ANSI.reset} Connection  ${ANSI.green}restored${ANSI.reset}`
        if (event.offlineDuration !== undefined) {
          msg += ` ${ANSI.dim}(offline ${formatDuration(event.offlineDuration)})${ANSI.reset}`
        }
        console.log(msg)
      }
    },

    upload(event: UploadEvent): void {
      const icon =
        event.event === 'error'
          ? `${ANSI.red}${ICONS.error}${ANSI.reset}`
          : `${ANSI.green}${ICONS.upload}${ANSI.reset}`

      let msg = `${PREFIX} ${icon} ${event.name}`

      if (event.event === 'success') {
        msg += `  ${ANSI.green}success${ANSI.reset}`
        if (event.filename) {
          msg += ` ${ANSI.dim}${event.filename}${ANSI.reset}`
        }
        if (event.size !== undefined) {
          msg += ` ${ANSI.dim}(${formatBytes(event.size)})${ANSI.reset}`
        }
        if (event.duration !== undefined) {
          msg += ` ${ANSI.dim}${formatDuration(event.duration)}${ANSI.reset}`
        }
      } else {
        msg += `  ${ANSI.red}error${ANSI.reset}`
        if (event.error) {
          const errMsg = typeof event.error === 'string' ? event.error : event.error.message
          msg += ` ${ANSI.red}${errMsg}${ANSI.reset}`
        }
      }

      console.log(msg)
    },

    debug(message: string, data?: unknown): void {
      if (!isDebug) return
      if (data !== undefined) {
        console.log(`${PREFIX} ${ANSI.dim}[debug]${ANSI.reset} ${message}`, data)
      } else {
        console.log(`${PREFIX} ${ANSI.dim}[debug]${ANSI.reset} ${message}`)
      }
    },

    time(label: string): () => void {
      if (!isDebug) return () => {}
      const start = performance.now()
      return () => {
        const elapsed = Math.round(performance.now() - start)
        console.log(`${PREFIX} ${ANSI.dim}[time]${ANSI.reset} ${label}: ${elapsed}ms`)
      }
    },
  }
}

// ============================================================================
// Browser Logger (CSS badges + collapsed groups)
// ============================================================================

function createBrowserLogger(level: 'info' | 'debug'): Logger {
  const isDebug = level === 'debug'

  return {
    auth(event: AuthEvent): void {
      const icon =
        event.outcome === 'success' ? ICONS.success : event.outcome === 'error' ? ICONS.error : ICONS.warning
      const iconStyle = event.outcome === 'success' ? CSS.success : event.outcome === 'error' ? CSS.error : CSS.warning

      const hasDetails = event.details && Object.keys(event.details).length > 0

      if (hasDetails || event.error) {
        console.groupCollapsed(`%cConvex%c Auth | %c${icon} ${event.phase}`, CSS.badge, '', iconStyle)
        if (event.details) console.log(event.details)
        if (event.error) console.error(event.error)
        console.groupEnd()
      } else {
        console.log(`%cConvex%c Auth | %c${icon} ${event.phase}`, CSS.badge, '', iconStyle)
      }
    },

    query(event: QueryEvent): void {
      // Queries are debug-only (too noisy for info)
      if (!isDebug) return

      const icon = event.event === 'error' ? ICONS.error : ICONS.query
      const iconStyle = event.event === 'error' ? CSS.error : CSS.dim

      let label = `%cConvex%c ${icon} %c${event.name}`
      const styles = [CSS.badge, iconStyle, CSS.name]

      if (event.event === 'update' && event.count !== undefined) {
        label += `%c (${event.count} items)`
        styles.push(CSS.dim)
      } else if (event.event === 'share' && event.refCount !== undefined) {
        label += `%c (shared, refCount: ${event.refCount})`
        styles.push(CSS.dim)
      } else if (event.event !== 'update') {
        label += `%c ${event.event}`
        styles.push(CSS.dim)
      }

      const hasData = event.data !== undefined || event.args !== undefined || event.error

      if (hasData) {
        console.groupCollapsed(label, ...styles)
        if (event.args !== undefined) console.log('Args:', event.args)
        if (event.data !== undefined) console.log('Data:', event.data)
        if (event.error) console.error('Error:', event.error)
        console.groupEnd()
      } else {
        console.log(label, ...styles)
      }
    },

    mutation(event: MutationEvent): void {
      const icon = event.event === 'error' ? ICONS.error : ICONS.mutation

      let label = `%cConvex%c ${icon} %c${event.name}`
      const styles = [CSS.badge, '', CSS.name]

      if (event.event === 'optimistic') {
        label += `%c optimistic`
        styles.push('color: #a855f7; font-weight: bold;') // purple for optimistic
      } else if (event.duration !== undefined) {
        label += `%c (${formatDuration(event.duration)})`
        styles.push(CSS.dim)
      }

      if (event.event === 'error') {
        label += `%c Failed`
        styles.push(CSS.error)
      }

      const hasDetails = (isDebug && event.args !== undefined) || event.error

      if (hasDetails) {
        console.groupCollapsed(label, ...styles)
        if (isDebug && event.args !== undefined) console.log('Args:', event.args)
        if (event.error) console.error('Error:', event.error)
        console.groupEnd()
      } else {
        console.log(label, ...styles)
      }
    },

    action(event: ActionEvent): void {
      const icon = event.event === 'error' ? ICONS.error : ICONS.action

      let label = `%cConvex%c ${icon} %c${event.name}`
      const styles = [CSS.badge, '', CSS.name]

      if (event.duration !== undefined) {
        label += `%c (${formatDuration(event.duration)})`
        styles.push(CSS.dim)
      }

      if (event.event === 'error') {
        label += `%c Failed`
        styles.push(CSS.error)
      }

      if (event.error) {
        console.groupCollapsed(label, ...styles)
        console.error('Error:', event.error)
        console.groupEnd()
      } else {
        console.log(label, ...styles)
      }
    },

    connection(event: ConnectionEvent): void {
      if (event.event === 'lost') {
        console.log(`%cConvex%c ${ICONS.warning} Connection %clost`, CSS.badge, CSS.warning, CSS.warning)
      } else {
        let label = `%cConvex%c ${ICONS.success} Connection %crestored`
        const styles = [CSS.badge, CSS.success, CSS.success]
        if (event.offlineDuration !== undefined) {
          label += `%c (offline ${formatDuration(event.offlineDuration)})`
          styles.push(CSS.dim)
        }
        console.log(label, ...styles)
      }
    },

    upload(event: UploadEvent): void {
      const icon = event.event === 'error' ? ICONS.error : ICONS.upload

      let label = `%cConvex%c ${icon} %c${event.name}`
      const styles = [CSS.badge, '', CSS.name]

      if (event.event === 'success') {
        if (event.filename) {
          label += `%c ${event.filename}`
          styles.push(CSS.dim)
        }
        if (event.size !== undefined) {
          label += `%c (${formatBytes(event.size)})`
          styles.push(CSS.dim)
        }
        if (event.duration !== undefined) {
          label += `%c ${formatDuration(event.duration)}`
          styles.push(CSS.dim)
        }
      } else {
        label += `%c Failed`
        styles.push(CSS.error)
      }

      if (event.error) {
        console.groupCollapsed(label, ...styles)
        console.error('Error:', event.error)
        console.groupEnd()
      } else {
        console.log(label, ...styles)
      }
    },

    debug(message: string, data?: unknown): void {
      if (!isDebug) return
      if (data !== undefined) {
        console.log(`%cConvex%c [debug] ${message}`, CSS.badge, CSS.dim, data)
      } else {
        console.log(`%cConvex%c [debug] ${message}`, CSS.badge, CSS.dim)
      }
    },

    time(label: string): () => void {
      if (!isDebug) return () => {}
      const start = performance.now()
      return () => {
        const elapsed = Math.round(performance.now() - start)
        console.log(`%cConvex%c [time] ${label}: ${elapsed}ms`, CSS.badge, CSS.dim)
      }
    },
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a logger with the specified level.
 * Automatically selects ANSI (server) or CSS (browser) styling.
 */
export function createLogger(level: LogLevel): Logger {
  if (!level) return noopLogger

  // Use ANSI on server, CSS in browser
  if (typeof window === 'undefined') {
    return createServerLogger(level)
  }
  return createBrowserLogger(level)
}

/**
 * Get log level from runtime config.
 */
export function getLogLevel(config: Record<string, unknown>): LogLevel {
  const logging = config.logging as LogLevel | undefined
  return logging ?? false
}
