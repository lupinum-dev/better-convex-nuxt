/**
 * Auth test harness — drives the real auth engine with controllable inputs.
 *
 * Creates a full Nuxt-runtime environment (`captureInNuxt`) with a real
 * `SharedAuthEngine` and the real `useConvexAuth()` composable,
 * and a mock transport that delegates token fetching to a `MockTokenExchange`.
 *
 * The harness provides reactive state, trigger helpers, and spies. Tests assert
 * directly on those refs so the harness stays close to the real runtime surface.
 *
 * The mock transport's `install()` is a no-op — the harness drives the engine
 * directly via composable methods, so the initial `setAuth` flow that would
 * normally be triggered by `ConvexClient` is out of scope for these unit tests.
 */
import type { Mock } from 'vitest'
import { vi } from 'vitest'
import type { Ref } from 'vue'

import { useNuxtApp, useState } from '#imports'

import {
  createSharedAuthEngine,
  getSharedAuthEngine,
  type SharedAuthEngine,
  type AuthTransport,
  type ClientAuthStateResult,
} from '../../src/runtime/client/auth-engine'
import { useConvexAuth } from '../../src/runtime/composables/useConvexAuth'
import { buildAuthTokenDecodeFailureMessage } from '../../src/runtime/utils/auth-errors'
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
  dispose(): void
}

function buildTransportResult(
  response: Awaited<ReturnType<MockTokenExchange['getNextResponse']>>,
): ClientAuthStateResult {
  if (response.error) {
    return {
      token: null,
      user: null,
      error: response.error.message,
      source: 'exchange',
    }
  }

  const token = response.data?.token ?? null
  if (!token) {
    return {
      token: null,
      user: null,
      error: null,
      source: 'exchange',
    }
  }

  const user = decodeUserFromJwt(token)
  if (!user) {
    return {
      token: null,
      user: null,
      error: buildAuthTokenDecodeFailureMessage(),
      source: 'exchange',
    }
  }

  return {
    token,
    user,
    error: null,
    source: 'exchange',
  }
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
    const wasAuthenticated = useState<boolean>(
      'better-convex:was-authenticated',
      () => Boolean(initialToken && initialUser),
    )

    token.value = initialToken
    user.value = initialUser
    pending.value = initialPending
    rawAuthError.value = initialAuthError
    wasAuthenticated.value = Boolean(initialToken && initialUser)

    nuxtApp.hook('convex:auth:changed', authChangedSpy)
    nuxtApp.hook('convex:unauthorized', unauthorizedSpy)

    const transport: AuthTransport = {
      client: { signOut: signOutSpy } as never,
      async fetchAuthState() {
        refreshHandlerSpy()
        const response = await tokenExchange.getNextResponse()
        return buildTransportResult(response)
      },
      // No-op: the harness drives the engine directly via composable methods.
      // The initial setAuth flow triggered by ConvexClient is out of scope.
      install(_fetchToken, _onChange) {
      },
      async refresh(fetchToken, onChange) {
        const nextToken = await fetchToken({ forceRefreshToken: true })
        onChange(Boolean(nextToken))
      },
      async invalidate() {
        invalidateHandlerSpy()
      },
    }

    let engine: SharedAuthEngine
    try {
      engine = getSharedAuthEngine(nuxtApp)
      engine.configureTransport(transport)
    } catch {
      engine = createSharedAuthEngine({
        nuxtApp,
        token,
        user,
        pending,
        rawAuthError,
        wasAuthenticated,
        transport,
      })
    }
    engine.initialize()

    return {
      auth: useConvexAuth(),
      engine,
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
      await (captured.result.engine as SharedAuthEngine).invalidateAuth({ clearWasAuthenticated: true })
      await flush()
    },
    async triggerSignOut() {
      await captured.result.auth.signOut()
      await flush()
    },
    flush,
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
