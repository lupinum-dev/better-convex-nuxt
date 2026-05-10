import type { NormalizedTrellisObservabilityConfig, TrellisObservationEvent } from './types.js'

export interface ObservationSink {
  emit(
    event: TrellisObservationEvent,
    config: NormalizedTrellisObservabilityConfig,
  ): void | Promise<void>
}

const defaultObservationSink: ObservationSink = {
  emit() {},
}

let activeObservationSink: ObservationSink = defaultObservationSink

const observationSinkTimeoutMs = 50

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof (value as { then?: unknown }).then === 'function'
  )
}

function timeout(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export async function deliverObservationToSink(
  event: TrellisObservationEvent,
  config: NormalizedTrellisObservabilityConfig,
): Promise<void> {
  const result = activeObservationSink.emit(event, config)
  if (!isPromiseLike(result)) return

  const delivery = Promise.resolve(result).catch(() => undefined)
  await Promise.race([delivery, timeout(observationSinkTimeoutMs)])
}

export function setObservationSinkForTests(sink: ObservationSink): () => void {
  const previous = activeObservationSink
  activeObservationSink = sink
  return () => {
    activeObservationSink = previous
  }
}
