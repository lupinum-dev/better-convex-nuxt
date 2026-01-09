import { createConsola, type ConsolaInstance, type LogObject } from 'consola'

// Event type definitions for canonical log lines
export interface PluginInitEvent {
  event: 'plugin:init'
  env: 'client' | 'server'
  config: { url: string; siteUrl: string; authEnabled: boolean }
  duration_ms: number
  outcome: 'success' | 'error'
  error?: { type: string; message: string; hint?: string }
}

export interface AuthChangeEvent {
  event: 'auth:change'
  env: 'client' | 'server'
  from: 'loading' | 'authenticated' | 'unauthenticated'
  to: 'loading' | 'authenticated' | 'unauthenticated'
  user_id?: string
  trigger: 'init' | 'login' | 'logout' | 'token-refresh' | 'ssr-hydration'
  token_age_ms?: number
}

export interface OperationCompleteEvent {
  event: 'operation:complete'
  env: 'client' | 'server'
  type: 'query' | 'mutation' | 'action'
  name: string
  duration_ms: number
  outcome: 'success' | 'error' | 'cancelled'
  cached?: boolean
  optimistic?: boolean
  args_preview?: string
  error?: { type: string; message: string; code?: string; retriable?: boolean }
}

export interface SubscriptionChangeEvent {
  event: 'subscription:change'
  env: 'client'
  name: string
  state: 'subscribed' | 'unsubscribed' | 'error' | 'reconnecting'
  cache_hit?: boolean
  updates_received?: number
  error?: { type: string; message: string }
}

export interface SSRHydrationEvent {
  event: 'ssr:hydration'
  outcome: 'match' | 'mismatch' | 'error'
  queries_hydrated: number
  auth_state_match: boolean
  mismatch_details?: string[]
  duration_ms: number
}

export interface ConnectionChangeEvent {
  event: 'connection:change'
  from: string
  to: string
  retry_count?: number
  offline_duration_ms?: number
}

export type LogEvent =
  | PluginInitEvent
  | AuthChangeEvent
  | OperationCompleteEvent
  | SubscriptionChangeEvent
  | SSRHydrationEvent
  | ConnectionChangeEvent

export interface LoggingOptions {
  /**
   * Enable module logging
   * - false: No logs (production default)
   * - true: Info-level logs
   * - 'debug': Include debug events
   */
  enabled: boolean | 'debug'
  /**
   * Output format
   * - 'pretty': Human-readable with colors (default)
   * - 'json': Structured JSON for log aggregation
   */
  format: 'pretty' | 'json'
}

export interface ModuleLogger {
  /** Emit a canonical log event */
  event(data: LogEvent): void
  /** Debug-level log (only shown when enabled: 'debug') */
  debug(message: string, data?: Record<string, unknown>): void
  /** Warning log */
  warn(message: string, data?: Record<string, unknown>): void
  /** Error log */
  error(message: string, data?: Record<string, unknown>): void
}

const OUTCOME_ICONS: Record<string, string> = {
  success: '\u2713',
  error: '\u2717',
  cancelled: '\u25CB',
  match: '\u2713',
  mismatch: '\u26A0',
}

const EVENT_ICONS: Record<string, string> = {
  'plugin:init': '\u25B6',
  'auth:change': '\u25CB',
  'operation:complete': '\u25B7',
  'subscription:change': '\u21BB',
  'ssr:hydration': '\u21C4',
  'connection:change': '\u21C5',
}

function formatPrettyEvent(data: LogEvent): { message: string; details?: string } {
  const icon = EVENT_ICONS[data.event] || '\u25AA'
  const outcomeIcon = 'outcome' in data ? OUTCOME_ICONS[data.outcome] || '' : ''

  switch (data.event) {
    case 'plugin:init': {
      const details = `url: ${data.config.url}, auth: ${data.config.authEnabled ? 'enabled' : 'disabled'}`
      return {
        message: `${icon} plugin:init ${outcomeIcon} ${data.env} ${data.duration_ms}ms`,
        details: data.error ? `error: ${data.error.message}` : details,
      }
    }

    case 'auth:change': {
      const userInfo = data.user_id ? `, user: ${data.user_id.slice(0, 8)}` : ''
      return {
        message: `${icon} auth:change ${data.from} \u2192 ${data.to}`,
        details: `trigger: ${data.trigger}${userInfo}`,
      }
    }

    case 'operation:complete': {
      const cacheInfo = data.cached ? ' (cached)' : ''
      const optimisticInfo = data.optimistic ? ' (optimistic)' : ''
      if (data.error) {
        return {
          message: `${icon} ${data.type} ${outcomeIcon} ${data.name} ${data.duration_ms}ms`,
          details: `error: ${data.error.type} "${data.error.message}"${data.error.retriable ? ', retriable' : ''}`,
        }
      }
      return {
        message: `${icon} ${data.type} ${outcomeIcon} ${data.name} ${data.duration_ms}ms${cacheInfo}${optimisticInfo}`,
      }
    }

    case 'subscription:change': {
      const cacheInfo = data.cache_hit ? ' (cache hit)' : ''
      const updates = data.updates_received !== undefined ? `, updates: ${data.updates_received}` : ''
      if (data.error) {
        return {
          message: `${icon} subscription ${data.name} ${data.state}`,
          details: `error: ${data.error.message}`,
        }
      }
      return {
        message: `${icon} subscription ${data.name} ${data.state}${cacheInfo}${updates}`,
      }
    }

    case 'ssr:hydration': {
      return {
        message: `${icon} ssr:hydration ${outcomeIcon} ${data.duration_ms}ms`,
        details: `queries: ${data.queries_hydrated}, auth match: ${data.auth_state_match}${data.mismatch_details?.length ? `, mismatches: ${data.mismatch_details.join(', ')}` : ''}`,
      }
    }

    case 'connection:change': {
      const retryInfo = data.retry_count !== undefined ? `, retry: ${data.retry_count}` : ''
      const offlineInfo =
        data.offline_duration_ms !== undefined ? `, offline: ${data.offline_duration_ms}ms` : ''
      return {
        message: `${icon} connection ${data.from} \u2192 ${data.to}${retryInfo}${offlineInfo}`,
      }
    }

    default:
      return { message: `${icon} ${(data as LogEvent).event}` }
  }
}

function createJSONReporter(): { log: (logObj: LogObject) => void } {
  return {
    log: (logObj: LogObject) => {
      // Extract the event data from args if present
      const eventData = logObj.args?.[0]
      if (eventData && typeof eventData === 'object' && 'event' in eventData) {
        // For canonical events, output clean JSON
        console.log(JSON.stringify({ timestamp: new Date().toISOString(), ...eventData }))
      } else {
        // For other logs, include level info
        console.log(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            level: logObj.type,
            message: logObj.args?.join(' '),
            ...((logObj.args?.[1] as Record<string, unknown>) || {}),
          }),
        )
      }
    },
  }
}

function createPrettyReporter(): { log: (logObj: LogObject) => void } {
  return {
    log: (logObj: LogObject) => {
      const eventData = logObj.args?.[0]
      if (eventData && typeof eventData === 'object' && 'event' in eventData) {
        const { message, details } = formatPrettyEvent(eventData as LogEvent)
        console.log(`[better-convex-nuxt] ${message}`)
        if (details) {
          console.log(`  \u2514\u2500 ${details}`)
        }
      } else {
        // Regular log
        const prefix = logObj.type === 'warn' ? '\u26A0' : logObj.type === 'error' ? '\u2717' : '\u25AA'
        console.log(`[better-convex-nuxt] ${prefix} ${logObj.args?.join(' ')}`)
      }
    },
  }
}

/** Create a no-op logger when logging is disabled */
function createNoopLogger(): ModuleLogger {
  const noop = () => {}
  return { event: noop, debug: noop, warn: noop, error: noop }
}

/** Create the module logger with the specified options */
export function createModuleLogger(options: LoggingOptions): ModuleLogger {
  if (!options.enabled) {
    return createNoopLogger()
  }

  const isDebug = options.enabled === 'debug'
  const reporter = options.format === 'json' ? createJSONReporter() : createPrettyReporter()

  const consola: ConsolaInstance = createConsola({
    level: isDebug ? 4 : 3, // 4 = debug, 3 = info
    reporters: [reporter],
  })

  return {
    event(data: LogEvent): void {
      consola.info(data)
    },

    debug(message: string, data?: Record<string, unknown>): void {
      if (isDebug) {
        if (data) {
          consola.debug(message, data)
        } else {
          consola.debug(message)
        }
      }
    },

    warn(message: string, data?: Record<string, unknown>): void {
      if (data) {
        consola.warn(message, data)
      } else {
        consola.warn(message)
      }
    },

    error(message: string, data?: Record<string, unknown>): void {
      if (data) {
        consola.error(message, data)
      } else {
        consola.error(message)
      }
    },
  }
}

/** Get logging options from runtime config */
export function getLoggingOptions(config: Record<string, unknown>): LoggingOptions {
  const logging = config.logging as Partial<LoggingOptions> | undefined
  return {
    enabled: logging?.enabled ?? false,
    format: logging?.format ?? 'pretty',
  }
}

/** Truncate and sanitize args for logging */
export function formatArgsPreview(args: unknown, maxLength = 100): string {
  try {
    const str = JSON.stringify(args)
    if (str.length <= maxLength) return str
    return str.slice(0, maxLength - 3) + '...'
  } catch {
    return '[unserializable]'
  }
}

/** Helper to measure operation duration */
export function createTimer(): () => number {
  const start = typeof performance !== 'undefined' ? performance.now() : Date.now()
  return () => Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - start)
}
