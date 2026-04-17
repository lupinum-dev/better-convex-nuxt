/**
 * Low-level debug/runtime logger for @lupinum/trellis plus a thin
 * browser/runtime observability bridge.
 */

import { createConsola, type ConsolaInstance } from 'consola'

import {
  createObservationEmitter,
  type TrellisObservationEvent,
  type TrellisObservationContext,
  type TrellisObservationInput,
  type TrellisObservationName,
  type TrellisObservationStatus,
  type TrellisObservationTransport,
} from './observability.js'

export type LogLevel = false | 'info' | 'debug'

export interface AuthEvent {
  phase: string
  outcome: 'success' | 'error' | 'skip' | 'miss'
  details?: Record<string, unknown>
  error?: Error
}

export interface QueryEvent {
  name: string
  event: 'subscribe' | 'update' | 'unsubscribe' | 'error' | 'share' | 'skip'
  count?: number
  refCount?: number
  reason?: string
  args?: unknown
  data?: unknown
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
  offlineDuration?: number
}

export interface UploadEvent {
  name: string
  event: 'success' | 'error'
  filename?: string
  size?: number
  duration?: number
  error?: Error | string
}

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
    level: isDebug ? 4 : 3,
  }).withTag('trellis')

  const auth = consola.withTag('auth')
  const query = consola.withTag('query')
  const mutation = consola.withTag('mutation')
  const action = consola.withTag('action')
  const connection = consola.withTag('connection')
  const upload = consola.withTag('upload')

  return {
    auth(event) {
      const msg = event.details
        ? `${event.phase} [${event.outcome}] ${Object.entries(event.details)
            .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
            .join(' ')}`
        : `${event.phase} [${event.outcome}]`
      if (event.error) {
        auth.error(msg, event.error)
      } else if (event.outcome === 'error') {
        auth.error(msg)
      } else {
        auth.info(msg)
      }
    },

    query(event) {
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
          msg += event.reason ? ` unsubscribe (${event.reason})` : ' unsubscribe'
          break
        case 'share':
          msg += ` share (refCount: ${event.refCount})`
          break
        case 'error':
          msg += ' error'
          break
        case 'skip':
          msg += event.reason ? ` skip (${event.reason})` : ' skip'
          break
      }

      if (event.error) {
        query.error(msg, event.error)
      } else {
        query.debug(msg)
      }
    },

    mutation(event) {
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

    action(event) {
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

    connection(event) {
      if (event.event === 'lost') {
        connection.warn('Connection lost')
      } else {
        const msg =
          event.offlineDuration !== undefined
            ? `Connection restored (offline ${formatDuration(event.offlineDuration)})`
            : 'Connection restored'
        connection.info(msg)
      }
    },

    upload(event) {
      let msg = event.name
      if (event.event === 'success') {
        const parts = [
          event.filename,
          event.size !== undefined ? formatBytes(event.size) : null,
          event.duration !== undefined ? formatDuration(event.duration) : null,
        ].filter(Boolean)
        msg += ` success${parts.length ? ` ${parts.join(' ')}` : ''}`
      } else {
        const errMsg = event.error
          ? typeof event.error === 'string'
            ? event.error
            : event.error.message
          : ''
        msg += ` error${errMsg ? ` ${errMsg}` : ''}`
      }
      if (event.event === 'error') {
        upload.error(msg)
      } else {
        upload.info(msg)
      }
    },

    debug(message, data) {
      if (!isDebug) return
      if (data !== undefined) {
        consola.debug(message, data)
      } else {
        consola.debug(message)
      }
    },

    time(label) {
      if (!isDebug) return () => {}
      const start = performance.now()
      return () => {
        const elapsed = Math.round(performance.now() - start)
        consola.debug(`${label}: ${elapsed}ms`)
      }
    },
  }
}

function getAuthObservationName(): TrellisObservationName {
  return 'auth.session.checked'
}

function toObservationStatus(outcome: AuthEvent['outcome']): TrellisObservationStatus {
  if (outcome === 'error') return 'error'
  if (outcome === 'skip' || outcome === 'miss') return 'skip'
  return 'success'
}

function logTransportForContext(context?: TrellisObservationContext): TrellisObservationTransport {
  return context?.transport ?? 'browser'
}

function createObservationLogger(
  input: TrellisObservationInput | LogLevel | false,
  context?: TrellisObservationContext,
): Logger {
  const level = getLogLevel(input)
  const debugLogger = level ? createConsolaLogger(level) : noopLogger
  const observationInput =
    typeof input === 'object' && input !== null && !Array.isArray(input)
      ? input
      : { logging: input }
  const observation = createObservationEmitter(
    typeof observationInput === 'object' && observationInput !== null
      ? (observationInput as TrellisObservationInput).observability
      : undefined,
    context,
  )

  const emit = (
    name: TrellisObservationName,
    status: TrellisObservationStatus,
    data: {
      phase?: string
      handler?: string
      reasonCode?: TrellisObservationEvent['reasonCode']
      durationMs?: number
      details?: Record<string, unknown>
    } = {},
  ) => {
    void observation.emit({
      name,
      status,
      transport: logTransportForContext(context),
      phase: data.phase,
      handler: data.handler,
      reasonCode: data.reasonCode,
      durationMs: data.durationMs,
      details: data.details,
    })
  }

  return {
    auth(event) {
      emit(getAuthObservationName(), toObservationStatus(event.outcome), {
        phase: event.phase,
        details: event.details,
      })
      debugLogger.auth(event)
    },

    query(event) {
      if (event.event === 'share') {
        debugLogger.query(event)
        return
      }

      const mapping: Record<QueryEvent['event'], TrellisObservationName> = {
        subscribe: 'query.subscribed',
        update: 'query.updated',
        unsubscribe: 'query.unsubscribed',
        error: 'query.failed',
        share: 'query.subscribed',
        skip: 'query.unsubscribed',
      }
      emit(mapping[event.event], event.event === 'error' ? 'error' : event.event === 'skip' ? 'skip' : 'success', {
        handler: event.name,
        reasonCode: event.event === 'error' ? 'query.failed' : undefined,
        details: {
          ...(typeof event.count === 'number' ? { count: event.count } : {}),
          ...(typeof event.refCount === 'number' ? { refCount: event.refCount } : {}),
        },
      })
      debugLogger.query(event)
    },

    mutation(event) {
      if (event.event === 'optimistic') {
        debugLogger.mutation(event)
        return
      }
      emit(event.event === 'success' ? 'mutation.completed' : 'mutation.failed', event.event === 'success' ? 'success' : 'error', {
        handler: event.name,
        durationMs: event.duration,
        reasonCode: event.event === 'error' ? 'mutation.failed' : undefined,
      })
      debugLogger.mutation(event)
    },

    action(event) {
      emit(event.event === 'success' ? 'action.completed' : 'action.failed', event.event === 'success' ? 'success' : 'error', {
        handler: event.name,
        durationMs: event.duration,
        reasonCode: event.event === 'error' ? 'action.failed' : undefined,
      })
      debugLogger.action(event)
    },

    connection(event) {
      emit(event.event === 'lost' ? 'connection.lost' : 'connection.restored', 'success', {
        details:
          typeof event.offlineDuration === 'number'
            ? { offlineDuration: event.offlineDuration }
            : undefined,
      })
      debugLogger.connection(event)
    },

    upload(event) {
      emit(event.event === 'success' ? 'upload.completed' : 'upload.failed', event.event === 'success' ? 'success' : 'error', {
        handler: event.name,
        durationMs: event.duration,
        reasonCode: event.event === 'error' ? 'upload.failed' : undefined,
        details: {
          ...(event.filename ? { filename: event.filename } : {}),
          ...(typeof event.size === 'number' ? { size: event.size } : {}),
        },
      })
      debugLogger.upload(event)
    },

    debug(message, data) {
      debugLogger.debug(message, data)
    },

    time(label) {
      return debugLogger.time(label)
    },
  }
}

export function createLogger(
  input: TrellisObservationInput | LogLevel | false,
  context?: TrellisObservationContext,
): Logger {
  return createObservationLogger(input, context)
}

export function getLogLevel(config: unknown): LogLevel {
  const logging = (
    config && typeof config === 'object' && 'logging' in config
      ? (config as { logging?: LogLevel }).logging
      : undefined
  ) as LogLevel | undefined
  return logging ?? false
}
