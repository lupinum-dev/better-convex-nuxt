import type { createAuthClient } from 'better-auth/vue'
import type { ComputedRef, Ref } from 'vue'

import { useNuxtApp, useState, computed } from '#imports'

import {
  AUTH_REFRESH_TIMEOUT_MS,
  STATE_KEY_AUTH_ERROR,
  STATE_KEY_PENDING,
  STATE_KEY_TOKEN,
  STATE_KEY_USER,
} from '../../utils/constants'
import { waitForPendingClear } from '../../utils/auth-pending'
import type { ConvexUser } from '../../utils/types'

type AuthClient = ReturnType<typeof createAuthClient>

export interface ConvexAuthController {
  token: Ref<string | null>
  user: Ref<ConvexUser | null>
  pending: Ref<boolean>
  rawAuthError: Ref<string | null>
  authError: ComputedRef<Error | null>
  isAuthenticated: ComputedRef<boolean>
  isAnonymous: ComputedRef<boolean>
  isSessionExpired: ComputedRef<boolean>
  client: AuthClient | null
  refreshAuth: () => Promise<void>
  awaitAuthReady: (options?: { timeoutMs?: number }) => Promise<boolean>
}

export function useConvexAuthController(): ConvexAuthController {
  const nuxtApp = useNuxtApp()
  const token = useState<string | null>(STATE_KEY_TOKEN, () => null)
  const user = useState<ConvexUser | null>(STATE_KEY_USER, () => null)
  const pending = useState<boolean>(STATE_KEY_PENDING, () => import.meta.client)
  const rawAuthError = useState<string | null>(STATE_KEY_AUTH_ERROR, () => null)
  const client = (nuxtApp.$auth as AuthClient | undefined) ?? null

  const authError = computed(() => (rawAuthError.value ? new Error(rawAuthError.value) : null))
  const isAuthenticated = computed(() => !!token.value && !!user.value)
  const isAnonymous = computed(() => !pending.value && !isAuthenticated.value)

  const wasAuthenticated = useState<boolean>(
    'better-convex:was-authenticated',
    () => !!token.value && !!user.value,
  )
  if (isAuthenticated.value) {
    wasAuthenticated.value = true
  }
  const isSessionExpired = computed(
    () => !pending.value && !isAuthenticated.value && wasAuthenticated.value,
  )

  const refreshAuth = async (): Promise<void> => {
    const appState = nuxtApp as typeof nuxtApp & {
      _convexRefreshAuthPromise?: Promise<void> | null
    }
    if (appState._convexRefreshAuthPromise) {
      return appState._convexRefreshAuthPromise
    }

    appState._convexRefreshAuthPromise = (async () => {
      pending.value = true
      rawAuthError.value = null

      try {
        await Promise.race([
          nuxtApp.callHook('better-convex:auth:refresh'),
          new Promise<never>((_resolve, reject) => {
            setTimeout(() => {
              if (import.meta.dev) {
                console.warn(
                  `[better-convex-nuxt] Auth refresh timed out after ${AUTH_REFRESH_TIMEOUT_MS}ms. Check auth configuration.`,
                )
              }
              reject(new Error(`Authentication refresh timed out after ${AUTH_REFRESH_TIMEOUT_MS}ms`))
            }, AUTH_REFRESH_TIMEOUT_MS)
          }),
        ])

        if (token.value)
          return
        if (rawAuthError.value)
          throw new Error(rawAuthError.value)

        rawAuthError.value = 'Authentication refresh completed without a token'
        throw new Error(rawAuthError.value)
      }
      catch (error) {
        rawAuthError.value = error instanceof Error ? error.message : String(error)
        throw error
      }
      finally {
        pending.value = false
        appState._convexRefreshAuthPromise = null
      }
    })()

    return appState._convexRefreshAuthPromise
  }

  const awaitAuthReady = async (options?: { timeoutMs?: number }): Promise<boolean> => {
    if (!import.meta.client) {
      return isAuthenticated.value
    }

    await waitForPendingClear(pending, {
      timeoutMs: options?.timeoutMs ?? AUTH_REFRESH_TIMEOUT_MS,
    })

    if (import.meta.dev && !isAuthenticated.value && pending.value) {
      console.warn(
        `[better-convex-nuxt] Auth state did not settle within ${options?.timeoutMs ?? AUTH_REFRESH_TIMEOUT_MS}ms. Check auth configuration.`,
      )
    }

    return isAuthenticated.value
  }

  return {
    token,
    user,
    pending,
    rawAuthError,
    authError,
    isAuthenticated,
    isAnonymous,
    isSessionExpired,
    client,
    refreshAuth,
    awaitAuthReady,
  }
}
