import { useState } from '#app'
import type { Ref } from 'vue'

import {
  STATE_KEY_AUTH_ERROR,
  STATE_KEY_AUTH_TRACE_ID,
  STATE_KEY_AUTH_WATERFALL,
  STATE_KEY_DEVTOOLS_INSTANCE_ID,
  STATE_KEY_PENDING,
  STATE_KEY_TOKEN,
  STATE_KEY_USER,
} from '../utils/constants'
import type { AuthWaterfall } from '../utils/auth-debug'

export interface HydrationState {
  convexToken: Ref<string | null>
  convexUser: Ref<unknown>
  convexAuthWaterfall: Ref<AuthWaterfall | null>
  convexAuthError: Ref<string | null>
  convexPending: Ref<boolean>
  resolveInitialAuth: () => void
}

/**
 * Initializes all SSR-hydrated auth state.
 * Dev-only state (waterfall, traceId, devtoolsInstanceId) is only allocated in dev builds.
 */
export function initHydrationState(): HydrationState {
  const convexToken = useState<string | null>(STATE_KEY_TOKEN)
  const convexUser = useState<unknown>(STATE_KEY_USER)
  const convexAuthError = useState<string | null>(STATE_KEY_AUTH_ERROR)
  const convexPending = useState(STATE_KEY_PENDING, () => true)

  const convexAuthWaterfall = import.meta.dev
    ? useState<AuthWaterfall | null>(STATE_KEY_AUTH_WATERFALL, () => null)
    : { value: null as AuthWaterfall | null }

  if (import.meta.dev) {
    useState<string>(
      STATE_KEY_AUTH_TRACE_ID,
      () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    )
    useState<string>(
      STATE_KEY_DEVTOOLS_INSTANCE_ID,
      () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    )
  }

  let hasResolvedInitialAuth = false
  const resolveInitialAuth = () => {
    if (!hasResolvedInitialAuth) {
      hasResolvedInitialAuth = true
      convexPending.value = false
    }
  }

  return {
    convexToken,
    convexUser,
    convexAuthWaterfall: convexAuthWaterfall as Ref<AuthWaterfall | null>,
    convexAuthError,
    convexPending,
    resolveInitialAuth,
  }
}
