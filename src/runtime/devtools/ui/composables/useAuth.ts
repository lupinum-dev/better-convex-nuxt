import { ref, onMounted, onUnmounted } from 'vue'
import type { EnhancedAuthState, ConnectionState } from '../../types'
import { callBridge } from './useBridge'

const authState = ref<EnhancedAuthState | null>(null)
const connectionState = ref<ConnectionState | null>(null)

/**
 * Composable for managing auth and connection state from the DevTools bridge.
 */
export function useAuth() {
  let intervalId: ReturnType<typeof setInterval> | null = null

  async function updateConnectionState() {
    try {
      connectionState.value = await callBridge<ConnectionState>('getConnectionState')
    } catch {
      // Ignore errors
    }
  }

  async function updateAuthState() {
    try {
      authState.value = await callBridge<EnhancedAuthState>('getEnhancedAuthState')
    } catch {
      // Ignore errors
    }
  }

  onMounted(async () => {
    // Initial fetch
    await Promise.all([
      updateConnectionState(),
      updateAuthState(),
    ])

    // Poll for updates every second
    intervalId = setInterval(() => {
      updateConnectionState()
      updateAuthState()
    }, 1000)
  })

  onUnmounted(() => {
    if (intervalId) {
      clearInterval(intervalId)
      intervalId = null
    }
  })

  return {
    authState,
    connectionState,
  }
}
