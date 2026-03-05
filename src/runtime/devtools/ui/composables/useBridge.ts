import { ref, onMounted, onUnmounted } from 'vue'

import { createUiDevtoolsTransport, type DevtoolsTransport } from '../../transport'
import type { ConvexDevToolsBridge } from '../../types'

type BridgeMethod = keyof Omit<ConvexDevToolsBridge, 'version'>

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

const transportRef = ref<DevtoolsTransport | null>(null)
const connected = ref(false)
const pendingRequests = new Map<number, PendingRequest>()
let messageId = 0
// The instance ID we're bound to (first instance that responds with READY)
let boundInstanceId: string | null = null
let cleanupBridgeListener: (() => void) | null = null

/**
 * Call a method on the DevTools bridge transport.
 */
export async function callBridge<T = unknown>(
  method: BridgeMethod,
  ...args: unknown[]
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!transportRef.value) {
      reject(new Error('Bridge not connected'))
      return
    }

    const id = ++messageId
    pendingRequests.set(id, { resolve: resolve as (value: unknown) => void, reject })

    transportRef.value.postMessage({
      type: 'CONVEX_DEVTOOLS_REQUEST',
      id,
      method,
      args,
      instanceId: boundInstanceId,
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
 * Initialize the DevTools bridge connection.
 */
export function useBridge() {
  onMounted(() => {
    transportRef.value = createUiDevtoolsTransport('convex-devtools')

    const handler = (event: { data: unknown }) => {
      const data = event.data
      if (!data || typeof data !== 'object') return
      const message = data as {
        type?: string
        id?: number
        error?: string
        result?: unknown
        instanceId?: string | null
      }

      if (message.type === 'CONVEX_DEVTOOLS_RESPONSE') {
        // Only accept responses from the bound instance to prevent cross-tab interference
        if (boundInstanceId && message.instanceId !== boundInstanceId) {
          return
        }

        if (typeof message.id !== 'number') return
        const pending = pendingRequests.get(message.id)
        if (pending) {
          pendingRequests.delete(message.id)
          if (message.error) {
            pending.reject(new Error(message.error))
          } else {
            pending.resolve(message.result)
          }
        }
      } else if (message.type === 'CONVEX_DEVTOOLS_READY') {
        // Bind to the first instance that responds with a valid instanceId
        if (!boundInstanceId && message.instanceId) {
          boundInstanceId = message.instanceId
        }
        connected.value = true
      }
    }

    transportRef.value.addEventListener('message', handler)

    // Request connection
    transportRef.value.postMessage({ type: 'CONVEX_DEVTOOLS_INIT' })

    // Mark as connected after timeout (fallback if READY message not received)
    setTimeout(() => {
      connected.value = true
    }, 2000)

    // Replace transport cleanup with closure to ensure listener removed
    cleanupBridgeListener = () => {
      transportRef.value?.removeEventListener('message', handler)
    }
  })

  onUnmounted(() => {
    cleanupBridgeListener?.()
    cleanupBridgeListener = null
    if (transportRef.value) {
      transportRef.value.close()
      transportRef.value = null
    }
    pendingRequests.clear()
    boundInstanceId = null
  })

  return {
    connected,
    callBridge,
  }
}

/**
 * Get the current devtools bridge transport instance.
 */
export function getBridgeTransport(): DevtoolsTransport | null {
  return transportRef.value
}

export function getBroadcastChannel(): DevtoolsTransport | null {
  return transportRef.value
}

export function getBoundBridgeInstanceId(): string | null {
  return boundInstanceId
}
