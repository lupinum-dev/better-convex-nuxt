import type {
  NormalizedTrellisObservabilityConfig,
  TrellisObservationContext,
  TrellisObservationStatus,
} from './types.js'

type ObservationSummaryOptions = {
  config: NormalizedTrellisObservabilityConfig
  initialContext?: Record<string, unknown>
}

type ObservationSummaryEmitInput = {
  status: TrellisObservationStatus
  durationMs?: number
  details?: Record<string, unknown>
}

export interface ObservationSummary {
  set(context: Record<string, unknown>): void
  info(message: string, context?: Record<string, unknown>): void
  warn(message: string, context?: Record<string, unknown>): void
  error(error: Error | string, context?: Record<string, unknown>): void
  emit(input: ObservationSummaryEmitInput): void
  getContext(): Record<string, unknown>
}

export function createObservationSummary(options: ObservationSummaryOptions): ObservationSummary {
  let context: Record<string, unknown> = {
    service: options.config.service,
    ...(options.initialContext ?? {}),
  }
  let emitted = false

  return {
    set(nextContext) {
      if (emitted) return
      context = { ...context, ...nextContext }
    },
    info() {},
    warn() {},
    error() {},
    emit(input) {
      if (emitted) return
      emitted = true
      context = {
        ...context,
        outcome: input.status,
        ...(typeof input.durationMs === 'number' ? { durationMs: input.durationMs } : {}),
        ...(input.details ? { details: input.details } : {}),
      }
    },
    getContext() {
      return { ...context }
    },
  }
}

export function createObservationSummaryContext(
  context: TrellisObservationContext,
  config: NormalizedTrellisObservabilityConfig,
): Record<string, unknown> {
  return {
    correlationId: context.correlationId,
    requestId: context.requestId,
    transport: context.transport,
    originTransport: context.originTransport,
    service: context.service ?? config.service,
    serviceId: context.serviceId,
    principalKind: context.principalKind,
    actorKind: context.actorKind,
    workspaceId: context.workspaceId,
    operation: context.operation,
    tool: context.tool,
  }
}
