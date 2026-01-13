import { ref, onMounted, onUnmounted } from 'vue'
import type { EnhancedAuthState, ConnectionState, AuthWaterfall } from '../../types'
import { callBridge } from './useBridge'

const authState = ref<EnhancedAuthState | null>(null)
const connectionState = ref<ConnectionState | null>(null)
const authWaterfall = ref<AuthWaterfall | null>(null)

/**
 * Check if two objects have the same values (shallow comparison for our use case)
 */
function hasChanged<T extends Record<string, unknown>>(prev: T | null, next: T | null): boolean {
  if (prev === null && next === null) return false
  if (prev === null || next === null) return true

  // Compare key properties that matter for UI updates
  const keys = Object.keys(next) as (keyof T)[]
  for (const key of keys) {
    const prevVal = prev[key]
    const nextVal = next[key]

    // For nested objects (like user), compare by JSON string
    if (typeof nextVal === 'object' && nextVal !== null) {
      if (JSON.stringify(prevVal) !== JSON.stringify(nextVal)) return true
    } else if (prevVal !== nextVal) {
      return true
    }
  }
  return false
}

/**
 * Composable for managing auth and connection state from the DevTools bridge.
 */
export function useAuth() {
  let intervalId: ReturnType<typeof setInterval> | null = null

  async function updateConnectionState() {
    try {
      const newState = await callBridge<ConnectionState>('getConnectionState')
      // Only update if changed to prevent unnecessary re-renders
      if (hasChanged(connectionState.value, newState)) {
        connectionState.value = newState
      }
    } catch {
      // Ignore errors
    }
  }

  async function updateAuthState() {
    try {
      const newState = await callBridge<EnhancedAuthState>('getEnhancedAuthState')
      // Only update if changed to prevent flickering
      if (hasChanged(authState.value, newState)) {
        authState.value = newState
      }
    } catch {
      // Ignore errors
    }
  }

  async function updateAuthWaterfall() {
    try {
      authWaterfall.value = await callBridge<AuthWaterfall | null>('getAuthWaterfall')
    } catch {
      // Ignore errors
    }
  }

  onMounted(async () => {
    // Initial fetch
    await Promise.all([
      updateConnectionState(),
      updateAuthState(),
      updateAuthWaterfall(),
    ])

    // Poll for updates (reduced frequency since auth doesn't change often)
    intervalId = setInterval(() => {
      updateConnectionState()
      updateAuthState()
    }, 2000) // Increased to 2 seconds
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
    authWaterfall,
  }
}
