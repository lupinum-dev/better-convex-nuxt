import type { createAuthClient } from 'better-auth/vue'
import type { ComputedRef, Ref } from 'vue'

import { useNuxtApp, useState } from '#imports'

import { getOrCreateSharedAuthEngine } from '../../client/auth-engine'
import {
  STATE_KEY_AUTH_ERROR,
  STATE_KEY_PENDING,
  STATE_KEY_TOKEN,
  STATE_KEY_USER,
} from '../../utils/constants'
import type { ConvexUser } from '../../utils/types'

type AuthClient = ReturnType<typeof createAuthClient>

export interface ConvexAuthController {
  token: Ref<string | null>
  user: Ref<ConvexUser | null>
  pending: Ref<boolean>
  rawAuthError: Ref<string | null>
  wasAuthenticated: Ref<boolean>
  authError: ComputedRef<Error | null>
  isAuthenticated: ComputedRef<boolean>
  isAnonymous: ComputedRef<boolean>
  isSessionExpired: ComputedRef<boolean>
  client: AuthClient | null
  refreshAuth: () => Promise<void>
  signOut: () => Promise<void>
  awaitAuthReady: (options?: { timeoutMs?: number }) => Promise<boolean>
}

export function useConvexAuthController(): ConvexAuthController {
  const nuxtApp = useNuxtApp()
  const token = useState<string | null>(STATE_KEY_TOKEN, () => null)
  const user = useState<ConvexUser | null>(STATE_KEY_USER, () => null)
  const pending = useState<boolean>(STATE_KEY_PENDING, () => import.meta.client)
  const rawAuthError = useState<string | null>(STATE_KEY_AUTH_ERROR, () => null)
  const wasAuthenticated = useState<boolean>(
    'better-convex:was-authenticated',
    () => Boolean(token.value && user.value),
  )

  const engine = getOrCreateSharedAuthEngine({
    nuxtApp,
    token,
    user,
    pending,
    rawAuthError,
    wasAuthenticated,
  })

  return {
    token,
    user,
    pending,
    rawAuthError,
    wasAuthenticated,
    authError: engine.authError,
    isAuthenticated: engine.isAuthenticated,
    isAnonymous: engine.isAnonymous,
    isSessionExpired: engine.isSessionExpired,
    get client() {
      return engine.client
    },
    refreshAuth: engine.refreshAuth,
    signOut: engine.signOut,
    awaitAuthReady: engine.awaitAuthReady,
  }
}
