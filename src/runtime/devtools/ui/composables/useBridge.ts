import { ref, onMounted, onUnmounted } from 'vue'
import type { ConvexDevToolsBridge } from '../../types'

type BridgeMethod = keyof Omit<ConvexDevToolsBridge, 'version'>

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

const channel = ref<BroadcastChannel | null>(null)
const connected = ref(false)
const pendingRequests = new Map<number, PendingRequest>()
let messageId = 0

/**
 * Call a method on the DevTools bridge via BroadcastChannel.
 */
export async function callBridge<T = unknown>(method: BridgeMethod, ...args: unknown[]): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!channel.value) {
      reject(new Error('Bridge not connected'))
      return
    }

    const id = ++messageId
    pendingRequests.set(id, { resolve: resolve as (value: unknown) => void, reject })

    channel.value.postMessage({
      type: 'CONVEX_DEVTOOLS_REQUEST',
      id,
      method,
      args,
    })

    // Timeout after 5 seconds
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id)
        reject(new Error('Request timeout'))
      }
    }, 5000)
  })
}

/**
 * Initialize the BroadcastChannel connection.
 */
export function useBridge() {
  onMounted(() => {
    channel.value = new BroadcastChannel('convex-devtools')

    channel.value.onmessage = (event) => {
      const data = event.data
      if (!data || typeof data !== 'object') return

      if (data.type === 'CONVEX_DEVTOOLS_RESPONSE') {
        const pending = pendingRequests.get(data.id)
        if (pending) {
          pendingRequests.delete(data.id)
          if (data.error) {
            pending.reject(new Error(data.error))
          } else {
            pending.resolve(data.result)
          }
        }
      } else if (data.type === 'CONVEX_DEVTOOLS_READY') {
        connected.value = true
      }
    }

    // Request connection
    channel.value.postMessage({ type: 'CONVEX_DEVTOOLS_INIT' })

    // Mark as connected after timeout (fallback if READY message not received)
    setTimeout(() => {
      connected.value = true
    }, 2000)
  })

  onUnmounted(() => {
    if (channel.value) {
      channel.value.close()
      channel.value = null
    }
    pendingRequests.clear()
  })

  return {
    connected,
    callBridge,
  }
}

/**
 * Get the current BroadcastChannel instance.
 */
export function getBroadcastChannel(): BroadcastChannel | null {
  return channel.value
}
