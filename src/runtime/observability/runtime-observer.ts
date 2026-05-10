import {
  createObservationEmitter,
  type PartialObservationEvent,
  type TrellisObservationContext,
  type TrellisObservationEvent,
  type TrellisObservationName,
  type TrellisObservationStatus,
} from './index.js'
import { createObservationSummary, createObservationSummaryContext } from './summary.js'

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

export interface RuntimeObserver {
  auth(event: AuthEvent): void
  query(event: QueryEvent): void
  mutation(event: MutationEvent): void
  action(event: ActionEvent): void
  connection(event: ConnectionEvent): void
  upload(event: UploadEvent): void
  debug(message: string, data?: unknown): void
  time(label: string): () => void
  setSummary(context: Record<string, unknown>): void
  emitSummary(input: {
    status: TrellisObservationStatus
    durationMs?: number
    details?: Record<string, unknown>
  }): void
}

type RuntimeObserverMeta = {
  method?: string
  path?: string
}

function toObservationInput(input: unknown): unknown {
  if (typeof input === 'object' && input !== null && 'observability' in input) {
    return (input as { observability?: unknown }).observability
  }
  return input
}

function toObservationStatus(outcome: AuthEvent['outcome']): TrellisObservationStatus {
  if (outcome === 'error') return 'error'
  if (outcome === 'skip' || outcome === 'miss') return 'skip'
  return 'success'
}

function getAuthObservationName(): TrellisObservationName {
  return 'auth.session.checked'
}

function createNoopRuntimeObserver(): RuntimeObserver {
  return {
    auth() {},
    query() {},
    mutation() {},
    action() {},
    connection() {},
    upload() {},
    debug() {},
    time() {
      return () => {}
    },
    setSummary() {},
    emitSummary() {},
  }
}

export function createRuntimeObserver(
  input: unknown,
  context: TrellisObservationContext = {},
  meta: RuntimeObserverMeta = {},
): RuntimeObserver {
  try {
    const emitter = createObservationEmitter(toObservationInput(input), context)
    const summary = createObservationSummary({
      config: emitter.config,
      initialContext: {
        ...createObservationSummaryContext(context, emitter.config),
        ...(meta.method ? { method: meta.method } : {}),
        ...(meta.path ? { path: meta.path } : {}),
      },
    })

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
      void emitter.emit({
        name,
        status,
        transport: context.transport ?? 'browser',
        phase: data.phase,
        handler: data.handler,
        reasonCode: data.reasonCode,
        durationMs: data.durationMs,
        details: data.details,
      } as PartialObservationEvent)
    }

    const observer: RuntimeObserver = {
      auth(event) {
        summary.set({
          authPhase: event.phase,
          authOutcome: event.outcome,
          ...(event.details ? { authDetails: event.details } : {}),
        })
        emit(getAuthObservationName(), toObservationStatus(event.outcome), {
          phase: event.phase,
          details: event.details,
        })
      },
      query(event) {
        if (event.event === 'share') {
          summary.set({ sharedQuery: event.name, queryRefCount: event.refCount })
          return
        }

        const mapping: Record<Exclude<QueryEvent['event'], 'share'>, TrellisObservationName> = {
          subscribe: 'query.subscribed',
          update: 'query.updated',
          unsubscribe: 'query.unsubscribed',
          error: 'query.failed',
          skip: 'query.unsubscribed',
        }

        summary.set({
          query: event.name,
          queryEvent: event.event,
          ...(typeof event.count === 'number' ? { itemCount: event.count } : {}),
          ...(event.reason ? { reason: event.reason } : {}),
        })

        emit(
          mapping[event.event],
          event.event === 'error' ? 'error' : event.event === 'skip' ? 'skip' : 'success',
          {
            handler: event.name,
            reasonCode: event.event === 'error' ? 'query.failed' : undefined,
            details: {
              ...(typeof event.count === 'number' ? { count: event.count } : {}),
              ...(typeof event.refCount === 'number' ? { refCount: event.refCount } : {}),
              ...(event.reason ? { reason: event.reason } : {}),
            },
          },
        )
      },
      mutation(event) {
        if (event.event === 'optimistic') {
          summary.set({ mutation: event.name, mutationEvent: 'optimistic' })
          return
        }

        summary.set({
          mutation: event.name,
          mutationEvent: event.event,
        })

        emit(
          event.event === 'success' ? 'mutation.completed' : 'mutation.failed',
          event.event === 'success' ? 'success' : 'error',
          {
            handler: event.name,
            durationMs: event.duration,
            reasonCode: event.event === 'error' ? 'mutation.failed' : undefined,
          },
        )
      },
      action(event) {
        summary.set({
          action: event.name,
          actionEvent: event.event,
        })

        emit(
          event.event === 'success' ? 'action.completed' : 'action.failed',
          event.event === 'success' ? 'success' : 'error',
          {
            handler: event.name,
            durationMs: event.duration,
            reasonCode: event.event === 'error' ? 'action.failed' : undefined,
          },
        )
      },
      connection(event) {
        summary.set({
          connectionEvent: event.event,
          ...(typeof event.offlineDuration === 'number'
            ? { offlineDuration: event.offlineDuration }
            : {}),
        })
        emit(event.event === 'lost' ? 'connection.lost' : 'connection.restored', 'success', {
          details:
            typeof event.offlineDuration === 'number'
              ? { offlineDuration: event.offlineDuration }
              : undefined,
        })
      },
      upload(event) {
        summary.set({
          upload: event.name,
          uploadEvent: event.event,
          ...(event.filename ? { filename: event.filename } : {}),
          ...(typeof event.size === 'number' ? { size: event.size } : {}),
        })
        emit(
          event.event === 'success' ? 'upload.completed' : 'upload.failed',
          event.event === 'success' ? 'success' : 'error',
          {
            handler: event.name,
            durationMs: event.duration,
            reasonCode: event.event === 'error' ? 'upload.failed' : undefined,
            details: {
              ...(event.filename ? { filename: event.filename } : {}),
              ...(typeof event.size === 'number' ? { size: event.size } : {}),
            },
          },
        )
      },
      debug() {},
      time(label) {
        const start = performance.now()
        return () => {
          const elapsed = Math.round(performance.now() - start)
          observer.debug(`${label}: ${elapsed}ms`)
        }
      },
      setSummary(nextContext) {
        summary.set(nextContext)
      },
      emitSummary(input) {
        summary.emit(input)
      },
    }

    return observer
  } catch {
    return createNoopRuntimeObserver()
  }
}
