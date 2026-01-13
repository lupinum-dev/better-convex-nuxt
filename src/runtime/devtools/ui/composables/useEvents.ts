import { ref, onMounted, onUnmounted } from 'vue'
import type { LogEvent } from '../../../utils/logger'
import { callBridge, getBroadcastChannel } from './useBridge'

const MAX_EVENTS = 100
const events = ref<LogEvent[]>([])

/**
 * Composable for managing event log data from the DevTools bridge.
 */
export function useEvents() {
  let cleanup: (() => void) | null = null

  onMounted(async () => {
    // Fetch initial data
    try {
      const initialEvents = (await callBridge<LogEvent[]>('getEvents')) || []
      events.value = initialEvents.slice(-MAX_EVENTS)
    } catch {
      // Ignore initial fetch errors
    }

    // Listen for real-time updates
    const channel = getBroadcastChannel()
    if (channel) {
      const handler = (event: MessageEvent) => {
        const data = event.data
        if (data?.type === 'CONVEX_DEVTOOLS_EVENT') {
          events.value = [...events.value, data.event].slice(-MAX_EVENTS)
        }
      }
      channel.addEventListener('message', handler)
      cleanup = () => channel.removeEventListener('message', handler)
    }
  })

  onUnmounted(() => {
    cleanup?.()
  })

  function clearEvents() {
    events.value = []
  }

  return {
    events,
    clearEvents,
  }
}
