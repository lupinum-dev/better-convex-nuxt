/**
 * Event buffer for DevTools integration.
 * Stores recent log events in memory for DevTools to query.
 */
import type { LogEvent } from '../utils/logger'

const EVENT_BUFFER_SIZE = 100

// Circular buffer for log events
const eventBuffer: LogEvent[] = []

// Subscribers for real-time event updates
type EventCallback = (event: LogEvent) => void
const subscribers = new Set<EventCallback>()

/**
 * Push a log event to the buffer and notify subscribers.
 * Call this from the logger when in dev mode.
 */
export function pushEvent(event: LogEvent): void {
  eventBuffer.push(event)
  if (eventBuffer.length > EVENT_BUFFER_SIZE) {
    eventBuffer.shift()
  }

  // Notify all subscribers
  for (const callback of subscribers) {
    try {
      callback(event)
    } catch {
      // Ignore callback errors
    }
  }
}

/**
 * Get all events currently in the buffer.
 */
export function getEventBuffer(): LogEvent[] {
  return [...eventBuffer]
}

/**
 * Subscribe to real-time events.
 * Returns an unsubscribe function.
 */
export function subscribeToEvents(callback: EventCallback): () => void {
  subscribers.add(callback)
  return () => {
    subscribers.delete(callback)
  }
}

/**
 * Clear all events from the buffer.
 */
export function clearEventBuffer(): void {
  eventBuffer.length = 0
}

/**
 * Get the number of events in the buffer.
 */
export function getEventCount(): number {
  return eventBuffer.length
}
