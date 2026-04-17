import { createConsola } from 'consola'

import { normalizeObservabilityConfig } from './config.js'
import type {
  NormalizedTrellisObservabilityConfig,
  PartialObservationEvent,
  TrellisObservationAdapter,
  TrellisObservationContext,
  TrellisObservationEvent,
  TrellisObservationFamily,
  TrellisObservationName,
} from './types.js'
import { alwaysOnEvents, criticalEvents, getObservationFamily, nonVerboseEvents } from './types.js'

const internalLogger = createConsola({ level: 3 }).withTag('trellis').withTag('observe')
const consoleAdapterLogger = createConsola({ level: 4 }).withTag('trellis').withTag('observe')

const sharedConsoleAdapter: TrellisObservationAdapter = (event) => {
  const parts = [
    event.name,
    event.handler ? `handler=${event.handler}` : null,
    event.operation ? `operation=${event.operation}` : null,
    event.tool ? `tool=${event.tool}` : null,
    event.reasonCode ? `reason=${event.reasonCode}` : null,
    event.principalKind ? `principal=${event.principalKind}` : null,
    event.actorKind ? `actor=${event.actorKind}` : null,
    event.tenantId ? `tenant=${event.tenantId}` : null,
    event.serviceId ? `service=${event.serviceId}` : null,
    typeof event.durationMs === 'number' ? `duration=${event.durationMs}ms` : null,
  ].filter(Boolean)
  const summary = parts.join(' ')
  if (event.status === 'error') {
    consoleAdapterLogger.error(summary, event.details ?? {})
    return
  }
  if (event.status === 'deny') {
    consoleAdapterLogger.warn(summary, event.details ?? {})
    return
  }
  consoleAdapterLogger.info(summary, event.details ?? {})
}

function captureEnabledForTransport(
  config: NormalizedTrellisObservabilityConfig,
  transport: TrellisObservationEvent['transport'],
): boolean {
  if (transport === 'browser') return config.capture.browser
  if (transport === 'mcp') return config.capture.mcp
  return config.capture.backend
}

function shouldSampleEvent(
  config: NormalizedTrellisObservabilityConfig,
  name: TrellisObservationName,
): boolean {
  if (alwaysOnEvents.has(name)) return true
  const family = getObservationFamily(name)
  const rate = config.sample[family]
  if (typeof rate !== 'number') return true
  if (rate <= 0) return false
  if (rate >= 1) return true
  return Math.random() < rate
}

function levelAllowsEvent(
  config: NormalizedTrellisObservabilityConfig,
  name: TrellisObservationName,
): boolean {
  if (alwaysOnEvents.has(name)) return true
  if (config.level === 'verbose') return true
  if (config.level === 'normal') return nonVerboseEvents.has(name)
  return criticalEvents.has(name)
}

function safeLogInternalFailure(
  phase: string,
  error: unknown,
  event?: PartialObservationEvent,
) {
  internalLogger.warn(`[observability] ${phase} failed`, {
    error: error instanceof Error ? error.message : String(error),
    ...(event?.name ? { event: event.name } : {}),
  })
}

type CreateObservationEmitterResult = {
  config: NormalizedTrellisObservabilityConfig
  emit: (event: PartialObservationEvent) => Promise<void>
  child: (next: TrellisObservationContext) => CreateObservationEmitterResult
}

export function createObservationEmitter(
  input: unknown,
  baseContext: TrellisObservationContext = {},
): CreateObservationEmitterResult {
  const config = normalizeObservabilityConfig(input, {
    allowCustomAdapters: true,
    allowFunctionHooks: true,
  })
  const adapter = typeof config.adapter === 'function' ? config.adapter : sharedConsoleAdapter

  let sharedCorrelationId: string
  try {
    sharedCorrelationId = baseContext.correlationId ?? config.correlation.generate()
  } catch (error) {
    safeLogInternalFailure('correlation.generate', error)
    sharedCorrelationId = `corr_fallback_${Math.random().toString(36).slice(2, 12)}`
  }

  const emit = async (event: PartialObservationEvent) => {
    try {
      const transport = event.transport ?? baseContext.transport ?? 'browser'
      if (!config.enabled || !captureEnabledForTransport(config, transport)) {
        return
      }
      if (!levelAllowsEvent(config, event.name)) return
      if (!shouldSampleEvent(config, event.name)) return

      let payload: TrellisObservationEvent
      try {
        payload = {
          ts: new Date().toISOString(),
          transport,
          name: event.name,
          status: event.status,
          correlationId: event.correlationId ?? sharedCorrelationId,
          originTransport: event.originTransport ?? baseContext.originTransport,
          phase: event.phase,
          requestId: event.requestId ?? baseContext.requestId,
          handler: event.handler ?? baseContext.handler,
          operation: event.operation ?? baseContext.operation,
          tool: event.tool ?? baseContext.tool,
          principalKind: event.principalKind ?? baseContext.principalKind,
          actorKind: event.actorKind ?? baseContext.actorKind,
          tenantId: event.tenantId ?? baseContext.tenantId,
          serviceId: event.serviceId ?? baseContext.serviceId,
          reasonCode: event.reasonCode,
          durationMs: event.durationMs,
          details: event.details,
        } as TrellisObservationEvent
      } catch (error) {
        safeLogInternalFailure('payload.build', error, event)
        return
      }

      let redacted: TrellisObservationEvent
      try {
        redacted = config.redact(payload)
      } catch (error) {
        safeLogInternalFailure('redact', error, event)
        redacted = payload
      }

      try {
        await adapter(redacted)
      } catch (error) {
        safeLogInternalFailure('adapter', error, event)
      }
    } catch (error) {
      safeLogInternalFailure('emit', error, event)
    }
  }

  return {
    config,
    emit,
    child: (next) =>
      createObservationEmitter(input, {
        ...baseContext,
        ...next,
        correlationId: next.correlationId ?? sharedCorrelationId,
      }),
  }
}

export function getObservationSampleFamily(name: TrellisObservationName): TrellisObservationFamily {
  return getObservationFamily(name)
}
