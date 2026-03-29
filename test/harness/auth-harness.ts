import type { Mock } from 'vitest'
import { expect, vi } from 'vitest'
import type { Ref } from 'vue'

import { useNuxtApp, useState } from '#imports'

import { useConvexAuth } from '../../src/runtime/composables/useConvexAuth'
import { useConvexAuthController } from '../../src/runtime/composables/internal/useConvexAuthController'
import {
  bumpAuthTransitionId,
  getAuthTransitionId,
} from '../../src/runtime/utils/auth-transition'
import { decodeUserFromJwt } from '../../src/runtime/utils/convex-shared'
import {
  STATE_KEY_AUTH_ERROR,
  STATE_KEY_PENDING,
  STATE_KEY_TOKEN,
  STATE_KEY_USER,
} from '../../src/runtime/utils/constants'
import type { ConvexUser } from '../../src/runtime/utils/types'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'
import { createMockTokenExchange, type MockTokenExchange } from './mock-token-exchange'

export interface AuthHarnessOptions {
  initialToken?: string | null
  initialUser?: ConvexUser | null
  initialPending?: boolean
  initialAuthError?: string | null
  signOutBehavior?: 'success' | 'fail' | 'slow' | (() => Promise<void>)
  tokenExchange?: MockTokenExchange
}

export interface AuthHarness {
  token: Ref<string | null>
  user: Ref<ConvexUser | null>
  pending: Ref<boolean>
  rawAuthError: Ref<string | null>
  isAuthenticated: Ref<boolean>
  isAnonymous: Ref<boolean>
  isSessionExpired: Ref<boolean>
  authChangedSpy: Mock
  unauthorizedSpy: Mock
  refreshHandlerSpy: Mock
  invalidateHandlerSpy: Mock
  signOutSpy: Mock
  tokenExchange: MockTokenExchange
  triggerRefresh(): Promise<void>
  triggerInvalidate(): Promise<void>
  triggerSignOut(): Promise<void>
  flush(): Promise<void>
  assertAuthenticated(userId?: string): void
  assertUnauthenticated(): void
  assertPending(): void
  assertNotPending(): void
  assertAuthError(pattern?: RegExp): void
  assertNoAuthError(): void
  dispose(): void
}

export async function createAuthHarness(
  options: AuthHarnessOptions = {},
): Promise<AuthHarness> {
  const {
    initialToken = null,
    initialUser = null,
    initialPending = false,
    initialAuthError = null,
    signOutBehavior = 'success',
  } = options

  const tokenExchange = options.tokenExchange ?? createMockTokenExchange()
  const authChangedSpy = vi.fn()
  const unauthorizedSpy = vi.fn()
  const refreshHandlerSpy = vi.fn()
  const invalidateHandlerSpy = vi.fn()
  const signOutSpy = buildSignOutMock(signOutBehavior)

  const captured = await captureInNuxt(() => {
    const nuxtApp = useNuxtApp()
    const token = useState<string | null>(STATE_KEY_TOKEN)
    const user = useState<ConvexUser | null>(STATE_KEY_USER)
    const pending = useState<boolean>(STATE_KEY_PENDING)
    const rawAuthError = useState<string | null>(STATE_KEY_AUTH_ERROR)

    token.value = initialToken
    user.value = initialUser
    pending.value = initialPending
    rawAuthError.value = initialAuthError

    nuxtApp.hook('convex:auth:changed', authChangedSpy)
    nuxtApp.hook('convex:unauthorized', unauthorizedSpy)
    const originalCallHook = nuxtApp.callHook.bind(nuxtApp)

    const runHarnessRefresh = async () => {
      refreshHandlerSpy()
      const transitionId = getAuthTransitionId(nuxtApp)
      const response = await tokenExchange.getNextResponse()

      if (getAuthTransitionId(nuxtApp) !== transitionId) {
        return
      }

      if (response.error) {
        token.value = null
        user.value = null
        rawAuthError.value = response.error.message
        throw response.error
      }

      const nextToken = response.data?.token ?? null
      if (!nextToken) {
        token.value = null
        user.value = null
        rawAuthError.value = null
        return
      }

      const decodedUser = decodeUserFromJwt(nextToken)
      if (!decodedUser) {
        token.value = null
        user.value = null
        rawAuthError.value = 'Failed to decode authenticated user from JWT'
        throw new Error(rawAuthError.value)
      }

      user.value = decodedUser
      token.value = nextToken
      rawAuthError.value = null
    }

    const runHarnessInvalidate = async () => {
      bumpAuthTransitionId(nuxtApp)
      invalidateHandlerSpy()
      token.value = null
      user.value = null
      rawAuthError.value = null
    }

    nuxtApp.callHook = (async (event: string, ...args: unknown[]) => {
      if (event === 'better-convex:auth:refresh') {
        await runHarnessRefresh()
        return
      }
      if (event === 'better-convex:auth:invalidate') {
        await runHarnessInvalidate()
        return
      }
      return await originalCallHook(event as never, ...(args as never[]))
    }) as typeof nuxtApp.callHook

    return {
      auth: useConvexAuth(),
      controller: useConvexAuthController(),
      token,
      user,
      pending,
      rawAuthError,
      nuxtApp,
    }
  }, {
    auth: { signOut: signOutSpy },
    convexConfig: {
      auth: {
        enabled: false,
      },
    },
  })

  const flush = async () => {
    await captured.flush()
    await Promise.resolve()
    await captured.flush()
  }

  const harness: AuthHarness = {
    token: captured.result.token,
    user: captured.result.user,
    pending: captured.result.pending,
    rawAuthError: captured.result.rawAuthError,
    isAuthenticated: captured.result.auth.isAuthenticated as Ref<boolean>,
    isAnonymous: captured.result.auth.isAnonymous as Ref<boolean>,
    isSessionExpired: captured.result.auth.isSessionExpired as Ref<boolean>,
    authChangedSpy,
    unauthorizedSpy,
    refreshHandlerSpy,
    invalidateHandlerSpy,
    signOutSpy: signOutSpy as Mock,
    tokenExchange,
    async triggerRefresh() {
      await captured.result.auth.refreshAuth()
      await flush()
    },
    async triggerInvalidate() {
      await captured.result.nuxtApp.callHook('better-convex:auth:invalidate')
      await flush()
    },
    async triggerSignOut() {
      await captured.result.auth.signOut()
      await flush()
    },
    flush,
    assertAuthenticated(userId) {
      expect(harness.isAuthenticated.value).toBe(true)
      expect(harness.pending.value).toBe(false)
      expect(harness.token.value).not.toBeNull()
      expect(harness.user.value).not.toBeNull()
      if (userId) {
        expect(harness.user.value?.id).toBe(userId)
      }
    },
    assertUnauthenticated() {
      expect(harness.isAuthenticated.value).toBe(false)
      expect(harness.pending.value).toBe(false)
      expect(harness.token.value).toBeNull()
      expect(harness.user.value).toBeNull()
    },
    assertPending() {
      expect(harness.pending.value).toBe(true)
    },
    assertNotPending() {
      expect(harness.pending.value).toBe(false)
    },
    assertAuthError(pattern) {
      const error = captured.result.auth.authError.value
      expect(error).toBeInstanceOf(Error)
      if (pattern) {
        expect(error?.message).toMatch(pattern)
      }
    },
    assertNoAuthError() {
      expect(captured.result.auth.authError.value).toBeNull()
    },
    dispose() {
      captured.wrapper.unmount()
    },
  }

  return harness
}

function buildSignOutMock(
  behavior: AuthHarnessOptions['signOutBehavior'],
): Mock {
  if (typeof behavior === 'function') {
    return vi.fn(behavior)
  }

  switch (behavior) {
    case 'fail':
      return vi.fn(async () => {
        throw new Error('Upstream signOut failed')
      })
    case 'slow':
      return vi.fn(
        () =>
          new Promise<void>((resolve) => {
            setTimeout(resolve, 50)
          }),
      )
    default:
      return vi.fn(async () => {})
  }
}
