import type { createAuthClient } from 'better-auth/vue'
import type { ComputedRef, Ref } from 'vue'

import { useNuxtApp, useState, computed } from '#imports'

import { initRuntimeAuthHooks } from '../../client/runtime-hooks'
import {
  AUTH_REFRESH_TIMEOUT_MS,
  STATE_KEY_AUTH_ERROR,
  STATE_KEY_PENDING,
  STATE_KEY_TOKEN,
  STATE_KEY_USER,
} from '../../utils/constants'
import { waitForPendingClear } from '../../utils/auth-pending'
import {
  bumpAuthTransitionId,
  getAuthTransitionId,
} from '../../utils/auth-transition'
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
  const client = (nuxtApp.$auth as AuthClient | undefined) ?? null

  initRuntimeAuthHooks(nuxtApp, token, user)

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
      const transitionId = getAuthTransitionId(nuxtApp)
      pending.value = true
      rawAuthError.value = null
      let timeoutId: ReturnType<typeof setTimeout> | null = null

      try {
        await Promise.race([
          nuxtApp.callHook('better-convex:auth:refresh'),
          new Promise<never>((_resolve, reject) => {
            timeoutId = setTimeout(() => {
              if (import.meta.dev) {
                console.warn(
                  `[better-convex-nuxt] Auth refresh timed out after ${AUTH_REFRESH_TIMEOUT_MS}ms. Check auth configuration.`,
                )
              }
              reject(new Error(`Authentication refresh timed out after ${AUTH_REFRESH_TIMEOUT_MS}ms`))
            }, AUTH_REFRESH_TIMEOUT_MS)
          }),
        ])

        if (getAuthTransitionId(nuxtApp) !== transitionId) {
          token.value = null
          user.value = null
          rawAuthError.value = null
          return
        }

        if (token.value)
          return
        if (rawAuthError.value)
          throw new Error(rawAuthError.value)

        token.value = null
        user.value = null
        rawAuthError.value = 'Authentication refresh completed without a token'
        throw new Error(rawAuthError.value)
      }
      catch (error) {
        if (getAuthTransitionId(nuxtApp) !== transitionId) {
          token.value = null
          user.value = null
          rawAuthError.value = null
          return
        }

        bumpAuthTransitionId(nuxtApp)
        token.value = null
        user.value = null
        rawAuthError.value = error instanceof Error ? error.message : String(error)
        throw error
      }
      finally {
        if (timeoutId !== null) {
          clearTimeout(timeoutId)
        }
        pending.value = false
        appState._convexRefreshAuthPromise = null
      }
    })()

    return appState._convexRefreshAuthPromise
  }

  const signOut = async (): Promise<void> => {
    const appState = nuxtApp as typeof nuxtApp & {
      _convexSignOutPromise?: Promise<void> | null
    }
    if (appState._convexSignOutPromise) {
      return appState._convexSignOutPromise
    }

    appState._convexSignOutPromise = (async () => {
      bumpAuthTransitionId(nuxtApp)
      pending.value = true
      rawAuthError.value = null
      token.value = null
      user.value = null
      wasAuthenticated.value = false

      let firstError: unknown = null

      try {
        if (import.meta.client) {
          try {
            await nuxtApp.callHook('better-convex:auth:invalidate')
          }
          catch (error) {
            firstError ??= error
          }
        }

        if (client) {
          try {
            await client.signOut()
          }
          catch (error) {
            firstError ??= error
          }
        }

        if (firstError) {
          rawAuthError.value = firstError instanceof Error ? firstError.message : String(firstError)
          throw firstError
        }
      } catch (error) {
        rawAuthError.value = error instanceof Error ? error.message : String(error)
        throw error
      } finally {
        pending.value = false
        appState._convexSignOutPromise = null
      }
    })()

    return appState._convexSignOutPromise
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
    wasAuthenticated,
    authError,
    isAuthenticated,
    isAnonymous,
    isSessionExpired,
    client,
    refreshAuth,
    signOut,
    awaitAuthReady,
  }
}
