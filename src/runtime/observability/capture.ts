import type { TrellisObservationEvent } from './types.js'

type ObservationCaptureListener = (event: TrellisObservationEvent) => void

const listeners = new Set<ObservationCaptureListener>()

export function registerObservationCaptureListener(
  listener: ObservationCaptureListener,
): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function emitObservationCapture(event: TrellisObservationEvent) {
  for (const listener of listeners) {
    try {
      listener(event)
    } catch {
      // Test capture must never affect runtime behavior.
    }
  }
}
