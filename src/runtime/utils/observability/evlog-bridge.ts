import {
  createLogger as createEvlogLogger,
  createRequestLogger,
  initLogger,
  log as evlogLog,
  type RequestLogger,
} from 'evlog'

import type {
  NormalizedTrellisObservabilityConfig,
  TrellisObservationContext,
  TrellisObservationEvent,
  TrellisObservationStatus,
} from './types.js'

type WideSummaryOptions = {
  config: NormalizedTrellisObservabilityConfig
  method?: string
  path?: string
  requestId?: string
  initialContext?: Record<string, unknown>
}

type WideSummaryEmitInput = {
  status: TrellisObservationStatus
  durationMs?: number
  details?: Record<string, unknown>
}

export interface TrellisWideSummary {
  set(context: Record<string, unknown>): void
  info(message: string, context?: Record<string, unknown>): void
  warn(message: string, context?: Record<string, unknown>): void
  error(error: Error | string, context?: Record<string, unknown>): void
  emit(input: WideSummaryEmitInput): void
  getContext(): Record<string, unknown>
}

let initializedSignature: string | null = null

function safeInternalDebug(message: string, error: unknown) {
  try {
    console.warn(`[trellis][observability] ${message}`, error)
  } catch {
    // Last-resort fallback must stay silent if console itself is unavailable.
  }
}

function toEvlogLevel(status: TrellisObservationStatus): 'info' | 'warn' | 'error' {
  if (status === 'error') return 'error'
  if (status === 'deny') return 'warn'
  return 'info'
}

function buildInitSignature(config: NormalizedTrellisObservabilityConfig): string {
  return JSON.stringify({
    enabled: config.enabled,
    service: config.service,
    level: config.level,
    env: process.env.NODE_ENV ?? 'development',
  })
}

export function ensureEvlogInitialized(config: NormalizedTrellisObservabilityConfig) {
  const signature = buildInitSignature(config)
  if (initializedSignature === signature) return

  try {
    initLogger({
      enabled: config.enabled,
      env: {
        service: config.service,
      },
      pretty: process.env.NODE_ENV !== 'production',
      redact: false,
      minLevel: 'debug',
      silent: false,
    })
    initializedSignature = signature
  } catch (error) {
    safeInternalDebug('evlog init failed', error)
  }
}

function createBasePayload(
  event: TrellisObservationEvent,
  config: NormalizedTrellisObservabilityConfig,
): Record<string, unknown> {
  return {
    kind: 'trellis-observation',
    name: event.name,
    status: event.status,
    transport: event.transport,
    originTransport: event.originTransport,
    correlationId: event.correlationId,
    requestId: event.requestId,
    phase: event.phase,
    handler: event.handler,
    operation: event.operation,
    tool: event.tool,
    principalKind: event.principalKind,
    actorKind: event.actorKind,
    tenantId: event.tenantId,
    service: event.service ?? config.service,
    serviceId: event.serviceId,
    durationMs: event.durationMs,
    reasonCode: event.reasonCode,
    details: event.details,
    ts: event.ts,
  }
}

export function deliverObservationToEvlog(
  event: TrellisObservationEvent,
  config: NormalizedTrellisObservabilityConfig,
) {
  try {
    ensureEvlogInitialized(config)
    const payload = createBasePayload(event, config)
    const level = toEvlogLevel(event.status)
    evlogLog[level](payload)
  } catch (error) {
    safeInternalDebug('evlog semantic delivery failed', error)
  }
}

function buildWideSummaryContext(
  logger: RequestLogger<Record<string, unknown>>,
  input: WideSummaryEmitInput,
  config: NormalizedTrellisObservabilityConfig,
) {
  const current = logger.getContext()
  return {
    ...current,
    service: current.service ?? config.service,
    outcome: input.status,
    ...(typeof input.durationMs === 'number' ? { durationMs: input.durationMs } : {}),
    ...(input.details ? { details: input.details } : {}),
  }
}

export function createWideSummary(options: WideSummaryOptions): TrellisWideSummary {
  ensureEvlogInitialized(options.config)

  const logger =
    options.method || options.path
      ? createRequestLogger<Record<string, unknown>>({
          ...(options.method ? { method: options.method } : {}),
          ...(options.path ? { path: options.path } : {}),
          ...(options.requestId ? { requestId: options.requestId } : {}),
        })
      : createEvlogLogger<Record<string, unknown>>(options.initialContext)

  if (options.initialContext) {
    try {
      logger.set(options.initialContext)
    } catch (error) {
      safeInternalDebug('evlog wide logger initial set failed', error)
    }
  }

  let emitted = false

  return {
    set(context) {
      if (emitted) return
      try {
        logger.set(context)
      } catch (error) {
        safeInternalDebug('evlog wide logger set failed', error)
      }
    },
    info(message, context) {
      if (emitted) return
      try {
        logger.info(message, context)
      } catch (error) {
        safeInternalDebug('evlog wide logger info failed', error)
      }
    },
    warn(message, context) {
      if (emitted) return
      try {
        logger.warn(message, context)
      } catch (error) {
        safeInternalDebug('evlog wide logger warn failed', error)
      }
    },
    error(error, context) {
      if (emitted) return
      try {
        logger.error(error, context)
      } catch (caught) {
        safeInternalDebug('evlog wide logger error failed', caught)
      }
    },
    emit(input) {
      if (emitted) return
      emitted = true
      try {
        logger.emit(buildWideSummaryContext(logger, input, options.config))
      } catch (error) {
        safeInternalDebug('evlog wide logger emit failed', error)
      }
    },
    getContext() {
      try {
        return logger.getContext()
      } catch (error) {
        safeInternalDebug('evlog wide logger getContext failed', error)
        return {}
      }
    },
  }
}

export function createWideSummaryContextFromObservation(
  context: TrellisObservationContext,
  config: NormalizedTrellisObservabilityConfig,
): Record<string, unknown> {
  return {
    correlationId: context.correlationId,
    requestId: context.requestId,
    transport: context.transport,
    originTransport: context.originTransport,
    principalKind: context.principalKind,
    actorKind: context.actorKind,
    tenantId: context.tenantId,
    service: context.service ?? config.service,
    serviceId: context.serviceId,
    handler: context.handler,
    operation: context.operation,
    tool: context.tool,
  }
}
