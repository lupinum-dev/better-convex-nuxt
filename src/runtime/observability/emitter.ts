import { emitObservationCapture } from './capture.js'
import { normalizeObservabilityConfig } from './config.js'
import { deliverObservationToSink } from './sink.js'
import type {
  NormalizedTrellisObservabilityConfig,
  PartialObservationEvent,
  TrellisObservationContext,
  TrellisObservationEvent,
  TrellisObservationName,
} from './types.js'
import { alwaysOnEvents, criticalEvents, getObservationFamily, nonVerboseEvents } from './types.js'

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

function safeLogInternalFailure(phase: string, error: unknown, event?: PartialObservationEvent) {
  try {
    console.warn('[trellis][observability] internal failure', {
      phase,
      error: error instanceof Error ? error.message : String(error),
      ...(event?.name ? { event: event.name } : {}),
    })
  } catch {
    // Never throw from internal observability diagnostics.
  }
}

type CreateObservationEmitterResult = {
  config: NormalizedTrellisObservabilityConfig
  emit: (event: PartialObservationEvent) => Promise<void>
  child: (next: TrellisObservationContext) => CreateObservationEmitterResult
}

function getDisabledObservabilityConfig(): NormalizedTrellisObservabilityConfig {
  try {
    return normalizeObservabilityConfig({ enabled: false })
  } catch {
    return {
      enabled: false,
      capture: {
        backend: false,
        mcp: false,
        browser: false,
      },
      level: 'critical',
      sample: {},
      redact: (event) => event,
      correlation: {
        header: 'x-trellis-correlation-id',
        generate: () => `corr_fallback_${Math.random().toString(36).slice(2, 12)}`,
      },
      service: 'app',
      explainability: {
        agentDenials: true,
      },
    }
  }
}

export function createObservationEmitter(
  input: unknown,
  baseContext: TrellisObservationContext = {},
): CreateObservationEmitterResult {
  let config: NormalizedTrellisObservabilityConfig
  try {
    config = normalizeObservabilityConfig(input)
  } catch (error) {
    safeLogInternalFailure('config.normalize', error)
    config = getDisabledObservabilityConfig()
  }

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
          workspaceId: event.workspaceId ?? baseContext.workspaceId,
          service: event.service ?? baseContext.service ?? config.service,
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
        emitObservationCapture(redacted)
      } catch (error) {
        safeLogInternalFailure('capture', error, event)
      }

      try {
        await deliverObservationToSink(redacted, config)
      } catch (error) {
        safeLogInternalFailure('sink', error, event)
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
